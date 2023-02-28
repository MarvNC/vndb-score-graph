// ==UserScript==
// @name        VNDB Official Links and Release Dates
// @namespace   Marv
// @homepageURL https://github.com/MarvNC/vn-userscripts
// @match       https://vndb.org/v*
// @grant       none
// @version     1.15
// @author      Marv
// @description Adds links and dates to the VNDB infobox.
// ==/UserScript==

const pathRegex = /^\/v(\d+)$/;
const vnIdRegex = /^\/(v\d+)/;

(async function () {
  const currentURL = new URL(document.URL);
  let linksElem, releasesElem;
  let allLinks, allReleases;

  // if on main tab, get info with existing doc, otherwise fetch main page
  if (currentURL.pathname.match(pathRegex)) {
    ({ officialLinks, otherLinks, allReleases } = getLangInfo(document));
  } else {
    const vnID = currentURL.pathname.match(vnIdRegex)[1];
    const vnURL = `https://vndb.org/${vnID}`;
    console.log(`Fetching ${vnURL}`);
    ({ officialLinks, otherLinks, allReleases } = await fetch(vnURL)
      .then((res) => res.text())
      .then((text) => getLangInfo(new DOMParser().parseFromString(text, 'text/html'))));
  }

  officialLinksElem = makeHTMLTable(officialLinks, 'Official Links');
  otherLinksElem = makeHTMLTable(otherLinks, 'Other Links', true);
  releasesElem = makeHTMLTable(allReleases, 'Release Dates');
  // ({ linksElem, releasesElem } = makeHtmlBox(allLinks, allReleases));

  const tbody = document.querySelector('.mainbox .vndetails tbody');

  const firstHeader = tbody.querySelector('tr.nostripe');

  tbody.insertBefore(releasesElem, firstHeader);
  tbody.insertBefore(officialLinksElem, firstHeader);
  tbody.insertBefore(otherLinksElem, firstHeader);
})();

/**
 * Gets the official links and release dates for the given document.
 * @param {DOM} document
 * @returns {object} allLinks, allReleases
 */
function getLangInfo(document) {
  const langInfo = extractLangInfo(document);
  const { officialLinks, otherLinks } = processLinks(langInfo);
  const allReleases = processReleases(langInfo);
  return { officialLinks, otherLinks, allReleases };
}

/**
 * Extracts language information from the given document.
 * @param {DOM} document
 * @returns {Array} langInfo
 */
function extractLangInfo(document) {
  const langInfo = [];

  [...document.querySelectorAll('.mainbox.vnreleases > details')].forEach((detail) => {
    const releases = detail.querySelectorAll('tr');
    const lang = detail.querySelector('summary > abbr.lang').outerHTML;
    const info = { lang, links: {} };

    for (const release of releases) {
      // ignore unofficial/mtl/patches
      const grayedout = release.querySelector('b.grayedout')?.textContent ?? '';
      if (
        !grayedout.match(/unofficial|patch|machine translation/) &&
        !release.querySelector('tr')?.classList?.contains('mtl') &&
        !release?.classList?.contains('mtl')
      ) {
        // get official link first for the case where there is only one link
        const officialLinkIcon = release.querySelector('abbr.external[title="Official website"]');
        if (officialLinkIcon) {
          info.links[officialLinkIcon.parentElement.href] = officialLinkIcon.title;
        }

        // get rest of links in dropdown
        const otherLinks = [...release.querySelectorAll('.elm_dd_relextlink li > a')];
        if (otherLinks.length > 0) {
          otherLinks.forEach((link) => {
            if (!info.links[link.href]) {
              info.links[link.href] = link.innerHTML;
            }
          });
        }

        // get release date
        if (!info.release && release.querySelector(`abbr.icons[title="complete"]`)) {
          info.release = release.querySelector('.tc1').innerHTML;
        }
      }
    }
    langInfo.push(info);
  });

  return langInfo;
}

/**
 * Processes language information to extract official and other links.
 * @param {Array} langInfo
 * @returns {object} officialLinks, otherLinks - maps of linkHTML to languages
 */
function processLinks(langInfo) {
  const officialLinks = new Map();
  const otherLinks = new Map();

  for (const lang of langInfo) {
    for (const link of Object.keys(lang.links)) {
      const linkType = lang.links[link];
      try {
        const url = new URL(link);
        let displayLink;
        if (linkType === 'Official website') {
          displayLink = url.hostname + url.pathname + url.search + url.hash;
          displayLink = displayLink.replace(/\/$/, '');
          displayLink = displayLink.replace(/^www./, '');
          if (displayLink.length > 53) {
            displayLink = displayLink.slice(0, 50) + '...';
          }
        } else {
          displayLink = linkType;
        }
        const linkHTML = `<a href="${link}">${displayLink}</a>`;
        if (linkType === 'Official website') {
          if (officialLinks.has(linkHTML)) {
            officialLinks.get(linkHTML).push(lang.lang);
          } else {
            officialLinks.set(linkHTML, [lang.lang]);
          }
        } else {
          if (otherLinks.has(linkHTML)) {
            otherLinks.get(linkHTML).push(lang.lang);
          } else {
            otherLinks.set(linkHTML, [lang.lang]);
          }
        }
      } catch (error) {
        console.log(link, error);
      }
    }
  }
  return { officialLinks, otherLinks };
}

/**
 * Processes language information to extract all release dates.
 * @param {Array} langInfo
 * @returns {Map} allReleases
 */
function processReleases(langInfo) {
  const allReleases = new Map();
  for (const lang of langInfo) {
    if (lang.release) {
      if (allReleases.has(lang.release)) {
        allReleases.get(lang.release).push(lang.lang);
      } else {
        allReleases.set(lang.release, [lang.lang]);
      }
    }
  }

  return allReleases;
}

/**
 *
 * @param {object} dataToLangFlags Map of links or data as the key mapped to values of arrays of languages
 */
function makeHTMLTable(dataToLangFlags, title, collapsible = false) {
  let tableHTML = '';
  if (collapsible) {
    tableHTML += `<details><summary>Expand</summary>`;
  }
  for (const [data, lang] of dataToLangFlags) {
    tableHTML += lang.join('') + data + '<br>';
  }

  if (collapsible) {
    tableHTML += '</details>';
  }

  const tableElem = document.createElement('tr');
  if (dataToLangFlags.size > 0) {
    tableElem.innerHTML = `<td>${title}</td><td>${tableHTML}</td>`;
  }
  return tableElem;
}
