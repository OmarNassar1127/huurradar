const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const cheerio = require('cheerio');
const { logInfo, logError } = require('./logger');

let genAI = null;

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Combined gross annual income of the household, in EUR. Optional: leave it
// unset and the AI reports a listing's income requirements without judging
// whether you personally qualify.
const COMBINED_GROSS_INCOME = process.env.COMBINED_GROSS_INCOME
  ? parseInt(process.env.COMBINED_GROSS_INCOME)
  : null;

// Rent at or below this always notifies, whatever the AI concludes about
// income caps. Set it to your real ceiling so a middenhuur cap you might still
// negotiate never silently filters a listing out. Unset = no override.
const ALWAYS_NOTIFY_MAX_PRICE = process.env.ALWAYS_NOTIFY_MAX_PRICE
  ? parseInt(process.env.ALWAYS_NOTIFY_MAX_PRICE)
  : null;

function initAI() {
  if (!process.env.GEMINI_API_KEY) {
    logInfo('GEMINI_API_KEY not set - AI analysis disabled');
    return null;
  }
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  logInfo(`Gemini AI initialized (model: ${MODEL})`);
  return genAI;
}

async function fetchPageText(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);

    // Remove script, style, nav, footer elements
    $('script, style, nav, footer, header, iframe, noscript').remove();

    // Get text content, clean up whitespace
    const text = $('body').text()
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim()
      .slice(0, 8000); // Limit to ~8000 chars for API

    return text;
  } catch (error) {
    logError('Failed to fetch page text', error.message);
    return null;
  }
}

async function generateMotivationLetter(listing, pageText) {
  if (!genAI) {
    throw new Error('AI not configured - cannot generate motivation letter');
  }

  if (!listing || !listing.street) {
    throw new Error('Invalid listing data provided');
  }

  const applicantProfile = (process.env.APPLICANT_PROFILE || '').trim();
  if (!applicantProfile) {
    throw new Error(
      'APPLICANT_PROFILE is not set. Describe your household in your own words ' +
      '(who you are, your work and contract type, income, why you are moving) ' +
      'so the letter has something true to say. See .env.example.'
    );
  }

  try {
    logInfo(`Generating motivation letter for: ${listing.street}`);

    const language = (process.env.LETTER_LANGUAGE || 'nl').toLowerCase();
    const languageName = language === 'en' ? 'English' : 'Dutch';
    const maxChars = parseInt(process.env.LETTER_MAX_CHARS) || 900;
    const signOff = (process.env.LETTER_SIGNATURE || '').trim();

    // A user-supplied template wins outright. Otherwise the model writes from
    // the profile. Either way nothing about the applicant is hardcoded here.
    const template = (process.env.LETTER_TEMPLATE || '').trim();

    const model = genAI.getGenerativeModel({ model: MODEL });

    const listingBlock = [
      `Address: ${listing.street}`,
      listing.city ? `City: ${listing.city}` : null,
      listing.price ? `Rent: EUR ${listing.price} per month` : null,
      listing.totalRooms ? `Rooms: ${listing.totalRooms}` : null,
      listing.livingArea ? `Living area: ${listing.livingArea} m2` : null,
    ].filter(Boolean).join('\n');

    const prompt = `Write a rental application motivation letter in ${languageName}.

THE PROPERTY
${listingBlock}

ABOUT THE APPLICANT (written by them, treat every detail as fact)
${applicantProfile}
${template ? `\nUSE THIS TEMPLATE. Keep its structure and tone, adapt the details to this specific property:\n${template}\n` : ''}
RULES
- Write in the first person, as the applicant.
- Use ONLY facts from the applicant profile above. Never invent an employer,
  an income, an age, a family situation or a reason for moving.
- If a detail is not in the profile, leave it out rather than guessing.
- Plain, natural ${languageName}. No flowery or corporate phrasing.
- Reference this specific property at least once.
- Maximum ${maxChars} characters.
${signOff ? `- Sign off with: ${signOff}` : '- End with a normal polite sign-off.'}

Output ONLY the letter body. No preamble, no commentary, no subject line.`;

    const result = await model.generateContent(prompt);
    const letter = result.response.text().trim();

    logInfo(`Motivation letter generated for ${listing.street}`);
    return letter;

  } catch (error) {
    logError('Failed to generate motivation letter', error.message);
    throw error;
  }
}

async function analyzeListingRequirements(listing) {
  if (!genAI) {
    return { shouldNotify: true, analysis: 'AI not configured - please check manually' };
  }

  try {
    logInfo(`Analyzing listing with AI: ${listing.street}`);

    // Fetch page content
    const pageText = await fetchPageText(listing.listingUrl);
    if (!pageText) {
      return { shouldNotify: true, analysis: 'Could not fetch listing page - please check manually' };
    }

    const model = genAI.getGenerativeModel({ model: MODEL });

    const householdSize = parseInt(process.env.HOUSEHOLD_SIZE) || null;
    const applicantBlock = COMBINED_GROSS_INCOME
      ? [
          `- Combined gross annual income: EUR ${COMBINED_GROSS_INCOME}`,
          `- Combined gross monthly income: EUR ${Math.round(COMBINED_GROSS_INCOME / 12)}`,
          householdSize ? `- Household size: ${householdSize}` : null,
        ].filter(Boolean).join('\n')
      : '- Not provided. Report the listing\'s requirements without judging whether the applicant qualifies.';

    const alwaysNotifyRule = ALWAYS_NOTIFY_MAX_PRICE
      ? `- HARD RULE: if the rent is EUR ${ALWAYS_NOTIFY_MAX_PRICE} per month or less, shouldNotify MUST be true, whatever the eligibility rules say. A maximum income cap does not override this. Still describe the cap in the analysis so the decision stays with the user.`
      : '- Set shouldNotify to false only when the listing states a hard rule the applicant clearly cannot meet.';

    const prompt = `Analyse this Dutch rental listing for its income and eligibility requirements.

Listing: ${listing.street}${listing.city ? `, ${listing.city}` : ''}
Rent: EUR ${listing.price} per month
URL: ${listing.listingUrl}

Applicant:
${applicantBlock}

Page content:
${pageText}

Respond with ONLY valid JSON, no markdown and no code fences:
{
  "shouldNotify": true or false,
  "analysis": "2-3 sentences"
}

Rules for shouldNotify:
${alwaysNotifyRule}
- Only a minimum income requirement that the applicant meets → true.
- Unsure, or the page does not say → true. A false negative costs the user a home; a false positive costs them ten seconds.

The analysis should state, briefly: any minimum income required, any maximum
income cap, any other hard eligibility condition (registration time, social
housing status, student-only), and whether the applicant appears to qualify.
Never state a number the page does not contain.`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();

    // Parse JSON response
    try {
      // Clean up response (remove markdown code blocks if present)
      const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      logInfo(`AI analysis complete for ${listing.street}: shouldNotify=${parsed.shouldNotify}`);
      return {
        shouldNotify: parsed.shouldNotify ?? true,
        analysis: parsed.analysis || 'No analysis provided'
      };
    } catch (parseError) {
      logError('Failed to parse AI JSON response', responseText);
      return { shouldNotify: true, analysis: responseText.slice(0, 500) };
    }

  } catch (error) {
    logError('AI analysis failed', error.message);
    return { shouldNotify: true, analysis: `AI error: ${error.message} - please check manually` };
  }
}

module.exports = {
  initAI,
  analyzeListingRequirements,
  generateMotivationLetter,
  fetchPageText
};
