/**
 * Lightweight, safe User-Agent parser for human-friendly session labels.
 * Avoids heavy dependencies while accurately detecting common OS, browser, and device categories.
 */

export interface ParsedUserAgent {
  readonly browser: string;
  readonly os: string;
  readonly device: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  readonly label: string;
}

export function parseUserAgent(uaString: string | null | undefined): ParsedUserAgent {
  if (!uaString || typeof uaString !== 'string') {
    return {
      browser: 'Web browser',
      os: 'Unknown device',
      device: 'unknown',
      label: 'Web browser',
    };
  }

  const ua = uaString;

  // OS detection
  let os = 'Unknown OS';
  let device: 'desktop' | 'mobile' | 'tablet' | 'unknown' = 'desktop';

  if (/iPad|Tablet/i.test(ua)) {
    os = 'iPadOS';
    device = 'tablet';
  } else if (/iPhone/i.test(ua)) {
    os = 'iOS';
    device = 'mobile';
  } else if (/Android/i.test(ua)) {
    os = 'Android';
    device = /Mobile/i.test(ua) ? 'mobile' : 'tablet';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
    device = 'desktop';
  } else if (/Windows NT 10.0|Windows NT 11.0/i.test(ua)) {
    os = 'Windows';
    device = 'desktop';
  } else if (/Windows/i.test(ua)) {
    os = 'Windows';
    device = 'desktop';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
    device = 'desktop';
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS';
    device = 'desktop';
  }

  // Browser detection (order matters because Chrome UA includes Safari, etc.)
  let browser = 'Web browser';

  if (/Edg\//i.test(ua)) {
    browser = 'Edge';
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = 'Opera';
  } else if (/Chrome\/|CriOS\//i.test(ua)) {
    browser = 'Chrome';
  } else if (/Firefox\/|FxiOS\//i.test(ua)) {
    browser = 'Firefox';
  } else if (/Safari\//i.test(ua) && !/Chrome\/|CriOS\//i.test(ua)) {
    browser = 'Safari';
  }

  const label = os !== 'Unknown OS' ? `${browser} on ${os}` : browser;

  return {
    browser,
    os,
    device,
    label,
  };
}
