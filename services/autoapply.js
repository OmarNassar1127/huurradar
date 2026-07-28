const { chromium } = require('playwright');
const { logInfo, logError } = require('./logger');
const { solveCaptcha, getCaptchaSolver } = require('./captcha');
const { generateMotivationLetter, fetchPageText } = require('./ai');

// Brockhoff's reCAPTCHA SITE key. This is public by design: Google requires it
// to be present in the page's own HTML for the widget to render, so it is not a
// secret and committing it leaks nothing. The secret half never leaves
// Brockhoff's server. Secret scanners flag it on entropy alone; see
// .gitleaksignore.
// gitleaks:allow
const BROCKHOFF_CAPTCHA_SITEKEY = '6LdDMisUAAAAAC4QTgj2BTNb1ZJ6tJAp9kkbPemT';

async function applyToBrockhoff(listing, customLetter = null) {
  if (!getCaptchaSolver()) {
    throw new Error('CAPTCHA solver not initialized - check CAPTCHA_API_KEY');
  }

  let browser = null;

  try {
    logInfo(`Starting auto-apply for: ${listing.street}, ${listing.city}`);

    let letter;
    if (customLetter) {
      // Use the custom/edited letter provided by user
      letter = customLetter;
      logInfo(`Using provided letter (${letter.length} chars)`);
    } else {
      // Generate fresh letter
      const pageText = await fetchPageText(listing.listingUrl);
      letter = await generateMotivationLetter(listing, pageText);
      logInfo(`Generated motivation letter (${letter.length} chars)`);
    }

    // 3. Launch browser
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // 4. Navigate to listing
    logInfo(`Navigating to ${listing.listingUrl}`);
    await page.goto(listing.listingUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // 5. Click "Reageren" button (not the chat widget)
    logInfo('Clicking Reageren button');
    // Try specific selectors first, avoiding the chat widget
    const reageerSelectors = [
      'a.button:has-text("Reageren")',
      'a:has-text("Reageren"):not(.chattext)',
      'button:has-text("Reageren")',
      '.reageer-button',
      'a[href*="reageren"]',
      'a.reageren',
      // Fallback: any visible link/button with Reageren
      ':visible:text("Reageren")'
    ];

    let clicked = false;
    for (const selector of reageerSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn && await btn.isVisible()) {
          await btn.click();
          clicked = true;
          logInfo(`Clicked Reageren using: ${selector}`);
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }

    if (!clicked) {
      // Last resort: scroll to find it and click by coordinates or evaluate
      logInfo('Trying scroll + evaluate approach');
      await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a, button'));
        const reageer = links.find(l =>
          l.textContent.includes('Reageren') &&
          !l.classList.contains('chattext') &&
          l.offsetParent !== null
        );
        if (reageer) reageer.click();
      });
    }

    await page.waitForTimeout(2000);

    // 6. Wait for form to be visible - try multiple selectors
    logInfo('Waiting for form to appear...');
    try {
      await page.waitForSelector('form, .reactie-form, #reactie, textarea', { timeout: 15000 });
      logInfo('Form found');
    } catch (e) {
      logError('Form not found, trying to scroll down');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
    }

    // 7. Fill form fields
    const applicantName = process.env.APPLICANT_NAME;
    if (!applicantName) throw new Error('APPLICANT_NAME not set in environment');
    const applicantEmail = process.env.APPLICANT_EMAIL;
    const applicantPhone = process.env.APPLICANT_PHONE || '';
    const applicantGender = process.env.APPLICANT_GENDER || 'man';

    if (!applicantEmail) {
      throw new Error('APPLICANT_EMAIL not set in environment');
    }

    // Get all input fields for debugging
    const inputs = await page.$$eval('input, textarea, select', els =>
      els.map(e => ({ tag: e.tagName, name: e.name, id: e.id, type: e.type, placeholder: e.placeholder }))
    );
    logInfo(`Found ${inputs.length} form fields`);

    // Gender radio button
    logInfo(`Selecting gender: ${applicantGender}`);
    try {
      const genderSelector = applicantGender.toLowerCase() === 'man'
        ? 'input[type="radio"][value*="an" i], input[type="radio"]:first-of-type'
        : 'input[type="radio"][value*="rouw" i], input[type="radio"]:nth-of-type(2)';
      await page.click(genderSelector, { timeout: 5000 });
      logInfo('Gender selected');
    } catch (e) {
      logInfo('Could not find gender radio, continuing...');
    }

    // Name field - try multiple approaches
    logInfo('Filling name field');
    try {
      const nameInput = await page.$('input[placeholder*="Naam" i], input[name*="naam" i], input[id*="naam" i]');
      if (nameInput) {
        await nameInput.fill(applicantName);
        logInfo('Name filled');
      } else {
        // Fallback: find first text input that's not email/phone
        const textInputs = await page.$$('input[type="text"]');
        if (textInputs.length > 0) {
          await textInputs[0].fill(applicantName);
          logInfo('Name filled (fallback)');
        }
      }
    } catch (e) {
      logError('Failed to fill name', e.message);
    }

    // Phone field (optional)
    if (applicantPhone) {
      logInfo('Filling phone field');
      try {
        const phoneInput = await page.$('input[placeholder*="Telefoon" i], input[name*="telefoon" i], input[type="tel"]');
        if (phoneInput) {
          await phoneInput.fill(applicantPhone);
          logInfo('Phone filled');
        }
      } catch (e) {
        logInfo('Could not find phone field, continuing...');
      }
    }

    // Email field
    logInfo('Filling email field');
    try {
      const emailInput = await page.$('input[type="email"], input[placeholder*="mail" i], input[name*="mail" i]');
      if (emailInput) {
        await emailInput.fill(applicantEmail);
        logInfo('Email filled');
      }
    } catch (e) {
      logError('Failed to fill email', e.message);
    }

    // Message field (motivation letter)
    logInfo('Filling motivation letter');
    try {
      const textarea = await page.$('textarea');
      if (textarea) {
        await textarea.fill(letter);
        logInfo('Letter filled');
      }
    } catch (e) {
      logError('Failed to fill letter', e.message);
    }

    // 8. Solve CAPTCHA
    logInfo('Solving reCAPTCHA...');
    const captchaToken = await solveCaptcha(BROCKHOFF_CAPTCHA_SITEKEY, listing.listingUrl);

    // Inject CAPTCHA token
    await page.evaluate((token) => {
      // Find the g-recaptcha-response textarea (hidden)
      const responseField = document.querySelector('textarea[name="g-recaptcha-response"]');
      if (responseField) {
        responseField.value = token;
      }
      // Also try to find any hidden input
      const hiddenInputs = document.querySelectorAll('input[name="g-recaptcha-response"]');
      hiddenInputs.forEach(input => input.value = token);

      // Trigger callback if exists
      if (typeof window.GRSubmit === 'function') {
        window.GRSubmit(token);
      }
    }, captchaToken);
    logInfo('CAPTCHA token injected');

    // 9. Check privacy checkbox
    logInfo('Checking privacy checkbox');
    try {
      await page.click('input[type="checkbox"]:not([name*="recaptcha"])', { timeout: 5000 });
    } catch (e) {
      logInfo('Could not find privacy checkbox or already checked');
    }

    // 10. Submit form
    logInfo('Submitting form');
    try {
      // Try multiple submit selectors
      const submitSelectors = [
        'text=VERSTUREN',
        'text=Versturen',
        'button:has-text("Versturen")',
        'input[type="submit"]',
        'button[type="submit"]',
        '.submit-button',
        'button.btn-primary'
      ];

      let submitted = false;
      for (const selector of submitSelectors) {
        try {
          const btn = await page.$(selector);
          if (btn && await btn.isVisible()) {
            await btn.click();
            submitted = true;
            logInfo(`Submitted using: ${selector}`);
            break;
          }
        } catch (e) {
          // Try next
        }
      }

      if (!submitted) {
        // Fallback: find any button with versturen text
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
          const submit = btns.find(b =>
            b.textContent.toLowerCase().includes('versturen') ||
            b.value?.toLowerCase().includes('versturen')
          );
          if (submit) submit.click();
        });
        logInfo('Submitted using evaluate fallback');
      }
    } catch (e) {
      logError('Submit failed', e.message);
      throw e;
    }

    // 11. Wait for response
    await page.waitForTimeout(3000);

    // Check for success indicators
    const pageContent = await page.content();
    const success = pageContent.includes('bedankt') ||
                   pageContent.includes('Bedankt') ||
                   pageContent.includes('ontvangen') ||
                   pageContent.includes('verzonden') ||
                   !pageContent.includes('error');

    if (!success) {
      throw new Error('Form submission may have failed - no success message detected');
    }

    logInfo(`Successfully applied to ${listing.street}`);

    await browser.close();
    return { success: true, letter };

  } catch (error) {
    const errorMsg = error.message || error.toString() || JSON.stringify(error);
    logError(`Auto-apply failed for ${listing.street}`, errorMsg);
    if (browser) {
      await browser.close();
    }
    throw new Error(errorMsg);
  }
}

async function applyToListing(listing, customLetter = null) {
  // Route to correct platform handler
  if (listing.platform === 'brockhoff') {
    return applyToBrockhoff(listing, customLetter);
  }

  throw new Error(`Auto-apply not supported for platform: ${listing.platform}`);
}

function isAutoApplyEnabled() {
  return getCaptchaSolver() !== null && process.env.APPLICANT_EMAIL;
}

module.exports = {
  applyToListing,
  applyToBrockhoff,
  isAutoApplyEnabled
};
