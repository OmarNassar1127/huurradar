const Captcha = require('2captcha');
const { logInfo, logError } = require('./logger');

let solver = null;

function initCaptchaSolver() {
  if (!process.env.CAPTCHA_API_KEY) {
    logInfo('CAPTCHA_API_KEY not set - auto-apply disabled');
    return null;
  }
  solver = new Captcha.Solver(process.env.CAPTCHA_API_KEY);
  logInfo('2captcha solver initialized');
  return solver;
}

async function solveCaptcha(siteKey, pageUrl) {
  if (!solver) {
    throw new Error('CAPTCHA solver not initialized');
  }

  try {
    logInfo(`Solving reCAPTCHA for ${pageUrl}`);
    const result = await solver.recaptcha(siteKey, pageUrl);
    logInfo('reCAPTCHA solved successfully');
    return result.data;
  } catch (error) {
    logError('Failed to solve CAPTCHA', error.message);
    throw error;
  }
}

function getCaptchaSolver() {
  return solver;
}

module.exports = {
  initCaptchaSolver,
  solveCaptcha,
  getCaptchaSolver
};
