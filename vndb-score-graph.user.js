// ==UserScript==
// @name        VNDB Score Graph
// @namespace   https://github.com/MarvNC
// @homepageURL https://github.com/MarvNC/vndb-score-graph
// @match       https://vndb.org/v*
// @version     1.23
// @author      Marv
// @description A userscript that adds score graphs to pages on vndb.
// @downloadURL https://github.com/MarvNC/vndb-score-graph/raw/master/vndb-score-graph.user.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.3.2/chart.min.js
// @require     https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@next/dist/chartjs-adapter-date-fns.bundle.js
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_setValue
// ==/UserScript==
const modalHtml = /* html */ `
<div class="modal">
  <div class="modal-content ivview">
    <p class="displayText"></p>
  </div>
</div>`;

const chartHtml = /* html */ `<canvas id="voteChart" style="background-color:white;"></canvas>`;

const addCSS = /* css */ `
.modal {
  display: none;
  position: fixed; 
  padding-top: 50px;
  left: 0; 
  top: 0;
  width: 100%;
  height: 100%; 
  background-color: rgba(0, 0, 0, 0.0);
}
.modal-content {
  position: relative; 
  padding: 20px; 
  margin: auto; 
  width: 35%;  
  overflow: auto;
}`;

const votePage = (id, page) => `https://vndb.org/${id}/votes?o=d&p=${page}&s=date`;

const votesPerPage = 50;
const sigFigs = 3;
const dayMs = 86400000;
const monthMs = 2629800000;
const pointHitRadius = 20;

let delayMs = 300;

// only on main page
if (document.URL.match(/v\d+$/)) {
  const title = document.querySelector('#maincontent > div > h1').innerText;
  const vnID = document.URL.match(/v\d+/)[0];
  const voteCount = parseInt(
    document.querySelector('.votegraph tfoot tr td').innerText.match(/(\d+) votes total/)[1]
  );

  // list of released releases with date, lang, title and remove duplicates
  const releases = [...document.querySelector('#maincontent div.vnreleases').querySelectorAll('tr')]
    .map((tr) => {
      const rel = {};
      rel.lang = [
        ...tr.parentElement.parentElement.parentElement.querySelector('abbr').classList,
      ].slice(-1)[0];
      rel.date = Date.parse(tr.querySelector('.tc1').innerText);
      rel.title = tr.querySelector('.tc4 a').title;
      return rel;
    })
    .filter((rel) => rel.date);

  releases.push({
    date: Date.parse(new Date().toISOString().slice(0, 10)),
    title: 'Today',
    lang: '',
  });

  const releasesData = [];
  releases.forEach((release) => {
    releasesData.push(
      { x: release.date, y: 0, release: release },
      { x: release.date, y: 10, release: release },
      NaN
    );
  });

  const voteStatsElem = document.querySelector('.votegraph td');

  GM_addStyle(addCSS);
  document.body.append(createElementFromHTML(modalHtml));
  const modal = document.querySelector('.modal');
  const displayText = document.querySelector('.displayText');
  const modalContent = document.querySelector('.modal-content');
  let started = false;

  voteStatsElem.innerHTML += /*html*/ `<b style="font-weight:normal;padding-left:5px">(<a>show graph</a>)</b>`;

  voteStatsElem.querySelector('b a').onclick = async () => {
    modal.style.display = 'block';
    if (!started) {
      started = true;

      let votes = await getVotes(voteCount, vnID, displayText, modal, modalContent);

      let [voteStats, popularity] = calculateStats(votes);

      displayText.remove();
      modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
      modal.style.paddingTop = 0;
      modalContent.style.top = '50%';
      modalContent.style.transform = 'translateY(-50%)';
      modalContent.style.backgroundColor = 'white';
      modalContent.style.width = '85%';

      // chart
      modalContent.append(createElementFromHTML(chartHtml));
      let ctx = document.getElementById('voteChart').getContext('2d');
      let chart = new Chart(ctx, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'Average',
              data: voteStats.map((vote) => {
                return { x: vote.date, y: vote.avg };
              }),
              backgroundColor: 'rgba(107, 0, 110, 0.1)',
              borderColor: 'rgba(107, 0, 110, 0.6)',
              borderWidth: 2,
              pointHitRadius: pointHitRadius,
              pointRadius: 0,
              tension: 0.3,
            },
            {
              label: '1 Month Average',
              data: voteStats.map((vote) => {
                return { x: vote.date, y: vote.moving };
              }),
              backgroundColor: 'rgba(52, 186, 235, 0)',
              borderColor: 'rgba(52, 186, 235, 0.3)',
              borderWidth: 2,
              hidden: true,
              pointHitRadius: pointHitRadius,
              pointRadius: 0,
              tension: 0.3,
            },
            {
              label: 'Last Twenty Votes',
              data: voteStats.map((vote) => {
                return { x: vote.date, y: vote.lastTwenty };
              }),
              backgroundColor: 'rgba(255, 0, 0, 0)',
              borderColor: 'rgba(255, 0, 0, 0.3)',
              borderWidth: 2,
              pointHitRadius: pointHitRadius,
              pointRadius: 0,
              tension: 0.3,
            },
            {
              label: 'Vote',
              data: votes.map((vote) => {
                return { x: vote.date, y: vote.vote, label: vote.user };
              }),
              backgroundColor: 'rgba(0, 30, 97, 0.2)',
              borderColor: 'rgba(0,0,0,0)',
              pointHitRadius: pointHitRadius,
              pointRadius: 1.5,
            },
            {
              label: 'Releases',
              data: releasesData,
              backgroundColor: 'rgba(255,0,0,0.3)',
              borderColor: 'rgba(0,0,0,0)',
              borderDash: [5, 10],
              borderWidth: 1,
              segment: {
                borderColor: (ctx) =>
                  !ctx.p0.skip && !ctx.p1.skip ? 'rgba(255,0,0,0.4)' : 'rgba(0,0,0,0)',
              },
              pointHitRadius: pointHitRadius,
              pointRadius: 2,
            },
            {
              label: '% of Total Votes',
              data: voteStats.map((vote) => {
                return { x: vote.date, y: vote.percent };
              }),
              backgroundColor: 'rgba(0,0,0,0)',
              borderColor: 'rgba(52, 191, 56, 0.3)',
              borderWidth: 2,
              pointHitRadius: pointHitRadius,
              pointRadius: 0,
            },
            {
              label: '2 Week Popularity',
              data: popularity,
              backgroundColor: 'rgba(0,0,0,0)',
              borderColor: 'rgba(199, 194, 50, 0.4)',
              borderWidth: 2,
              pointHitRadius: pointHitRadius,
              pointRadius: 0,
              tension: 0.4,
            },
          ],
        },
        options: {
          plugins: {
            title: {
              display: true,
              text: title + ': Votes Over Time',
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  let label;
                  if (context.dataset.label == 'Vote') {
                    label = `${votes[context.dataIndex].user}: ${context.parsed.y}`;
                  } else if (context.dataset.label == 'Releases') {
                    label =
                      context.dataset.data[context.dataIndex].release.lang +
                      ': ' +
                      context.dataset.data[context.dataIndex].release.title;
                  } else if (context.dataset.label.startsWith('%')) {
                    label = (context.parsed.y * 10).toPrecision(sigFigs) + '%';
                  } else if (context.dataset.label.endsWith('Popularity')) {
                    label =
                      context.dataset.label +
                      ': ' +
                      context.dataset.data[context.dataIndex].popularity;
                  } else {
                    label = `${context.dataset.label}: ${context.parsed.y}`;
                  }
                  return label;
                },
              },
            },
          },
          scales: {
            x: {
              type: 'time',
              time: {
                unit: 'month',
                tooltipFormat: 'yyyy-MM-dd',
              },
              title: {
                display: true,
                text: 'Date',
              },
              offset: true,
            },
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Vote',
              },
            },
          },
        },
      });
    }
  };

  window.onclick = function (event) {
    if (event.target == modal) {
      modal.style.display = 'none';
    }
  };
}

async function getVotes(voteCount, vnID, displayText) {
  if (GM_getValue('votes', {})[vnID]?.updated + dayMs > Date.now()) {
    return GM_getValue('votes', null)[vnID].votes;
  }
  const votes = [];
  let last = Math.ceil(voteCount / votesPerPage);
  for (let i = 1; i <= last; i++) {
    displayText.innerText = `Loading page ${i} of ${last}, ${votes.length} votes grabbed`;
    let doc = document.createElement('html');
    doc.innerHTML = await getUrl(votePage(vnID, i));
    if (doc.querySelector('#maincontent > div.mainbox > p')) last = true;
    else {
      votes.push(
        ...[
          ...doc.querySelector('.mainbox.votelist').querySelector('tbody').querySelectorAll('tr'),
        ].map((tr) => {
          const vote = {};
          vote.date = Date.parse(tr.querySelector('.tc1').innerText);
          vote.vote = parseFloat(tr.querySelector('.tc2').innerText);
          vote.user = tr.querySelector('.tc3').innerText;
          return vote;
        })
      );
    }
    doc.remove();
  }

  votes.reverse();

  let vns = GM_getValue('votes', {});
  vns[vnID] = { updated: Date.now(), votes: votes };
  GM_setValue('votes', vns);
  return votes;
}

/**
 * Calculates and modifies stats for an array in place, also returns a new array of popularity.
 * @param {*} voteStats
 */
function calculateStats(votes) {
  let voteStats = [],
    sum = 0,
    moving = [],
    lastTwenty = [];
  for (let i = 0; i < votes.length; i++) {
    voteStats[i] = {};
    voteStats[i].date = votes[i].date;
    sum += votes[i].vote;
    voteStats[i].avg = (sum / (i + 1)).toPrecision(sigFigs);

    moving.push(votes[i]);
    while (moving.length > 1 && moving[0].date + monthMs < votes[i].date) {
      moving.shift();
    }
    voteStats[i].moving = (
      moving.reduce((prev, curr) => prev + curr.vote, 0) / moving.length
    ).toPrecision(sigFigs);

    lastTwenty.push(votes[i].vote);
    if (lastTwenty.length > 20) lastTwenty.shift();
    voteStats[i].lastTwenty = (
      lastTwenty.reduce((prev, curr) => prev + curr, 0) / lastTwenty.length
    ).toPrecision(sigFigs);

    voteStats[i].percent = ((i + 1) / votes.length) * 10;
  }

  let i = 0,
    popularity = [],
    timeStamps = [];
  for (let epoch = votes[0].date; epoch < Date.now(); epoch += dayMs) {
    let modified = false;
    while (votes[i]?.date <= epoch) {
      timeStamps.push(votes[i]?.date);
      modified = true;
      i++;
    }
    while (timeStamps[0] + dayMs * 14 < epoch) {
      timeStamps.shift();
      modified = true;
    }
    if (modified) popularity.push({ x: epoch, popularity: timeStamps.length });
  }
  let maxPop = Math.max(...popularity.map((pop) => pop.popularity));
  popularity.forEach((pop) => (pop.y = ((pop.popularity / maxPop) * 10).toPrecision(sigFigs)));

  // filter duplicates
  voteStats = voteStats.filter((vote, index, arr) => vote.date != arr[index + 1]?.date);

  return [voteStats, popularity];
}

function createElementFromHTML(htmlString) {
  var div = document.createElement('div');
  div.innerHTML = htmlString.trim();

  return div.firstChild;
}

async function getUrl(url) {
  let response = await fetch(url);
  let waitMs = delayMs;
  await timer(waitMs);
  while (!response.ok) {
    response = await fetch(url);
    waitMs *= 2;
    delayMs *= 1.2;
    delayMs = Math.round(delayMs);
    console.log('Failed response, new wait:' + waitMs);
    await timer(waitMs);
  }
  return await response.text();
}

function timer(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
