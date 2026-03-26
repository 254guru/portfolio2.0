'use strict';

// Helper: build a <picture> block if webp paths exist, otherwise a plain <img>
function buildImage(item, cssClass, loading) {
  const loadAttr = loading ? ` loading="${loading}"` : '';
  const classAttr = cssClass ? ` class="${cssClass}"` : '';
  if (item.webp) {
    return `<picture>
                    <source srcset="${item.webp}-400.webp 400w, ${item.webp}-800.webp 800w" type="image/webp">
                    <img src="${item.image}" alt="${item.alt}"${classAttr}${loadAttr}>
                  </picture>`;
  }
  return `<img src="${item.image}" alt="${item.alt}"${classAttr}${loadAttr}>`;
}

// Render sidebar personal info
function renderSidebar(about) {
  const nameEl = document.querySelector('.sidebar .name');
  const titleEl = document.querySelector('.sidebar .title');
  const emailLink = document.querySelector('.sidebar a[href^="mailto:"]');
  const phoneLink = document.querySelector('.sidebar a[href^="tel:"]');
  const birthdayTime = document.querySelector('.sidebar time[datetime]');
  const locationAddr = document.querySelector('.sidebar address');
  const avatarPicture = document.querySelector('.sidebar .avatar-box picture');
  const socialList = document.getElementById('social-list');

  if (nameEl) { nameEl.textContent = about.name; nameEl.title = about.name; }
  if (titleEl) titleEl.textContent = about.title;
  if (emailLink) { emailLink.href = `mailto:${about.email}`; emailLink.textContent = about.email; }
  if (phoneLink) { phoneLink.href = `tel:${about.phoneHref}`; phoneLink.textContent = about.phone; }
  if (birthdayTime) { birthdayTime.dateTime = about.birthday.datetime; birthdayTime.textContent = about.birthday.display; }
  if (locationAddr) locationAddr.textContent = about.location;
  if (avatarPicture) {
    avatarPicture.innerHTML = `
          <source srcset="${about.avatar.webp}-400.webp 400w, ${about.avatar.webp}-800.webp 800w" type="image/webp">
          <img src="${about.avatar.fallback}" alt="${about.avatar.alt}" width="80" height="80">`;
  }
  if (socialList) {
    socialList.innerHTML = about.social.map(function (s) {
      return `<li class="social-item">
            <a href="${s.url}" class="social-link" aria-label="${s.name}">
              <ion-icon name="${s.icon}"></ion-icon>
            </a>
          </li>`;
    }).join('');
  }
}

// Render about bio paragraphs
function renderAboutBio(bio) {
  const aboutText = document.querySelector('.about-text');
  if (aboutText) {
    aboutText.innerHTML = bio.map(function (p) { return `<p>${p}</p>`; }).join('\n');
  }
}

// Render "What I'm doing" services list (About page)
function renderAboutServices(services) {
  const list = document.getElementById('services-about-list');
  if (!list) return;
  list.innerHTML = services.map(function (s) {
    return `<li class="service-item">
            <div class="service-icon-box">
              <img src="${s.icon}" alt="${s.iconAlt}" width="40">
            </div>
            <div class="service-content-box">
              <h4 class="h4 service-item-title">${s.title}</h4>
              <p class="service-item-text">${s.description}</p>
            </div>
          </li>`;
  }).join('');
}

// Render resume timeline (education or experience)
function renderTimeline(listId, items) {
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = items.map(function (item) {
    return `<li class="timeline-item">
            <h4 class="h4 timeline-item-title">${item.title}</h4>
            <span>${item.period}</span>
            <p class="timeline-text">${item.description}</p>
          </li>`;
  }).join('');
}

// Render skills list
function renderSkills(skills) {
  const list = document.getElementById('skills-list');
  if (!list) return;
  list.innerHTML = skills.map(function (s) {
    return `<li class="skills-item">
            <div class="title-wrapper">
              <h5 class="h5">${s.name}</h5>
              <data value="${s.level}">${s.level}%</data>
            </div>
            <div class="skill-progress-bg">
              <div class="skill-progress-fill" style="width: ${s.level}%;"></div>
            </div>
          </li>`;
  }).join('');
}

// Render the full Services page
function renderServicesPage(servicesPage) {
  const introEl = document.getElementById('services-intro-text');
  const grid = document.getElementById('services-page-grid');
  const clientsList = document.getElementById('ideal-clients-list');

  if (introEl) introEl.textContent = servicesPage.intro;
  if (grid) {
    grid.innerHTML = servicesPage.cards.map(function (card) {
      return `<div class="service-card">
              <h3 class="service-card-title">${card.title}</h3>
              <ul class="service-card-list">
                ${card.items.map(function (item) { return `<li>${item}</li>`; }).join('')}
              </ul>
            </div>`;
    }).join('');
  }
  if (clientsList) {
    clientsList.innerHTML = servicesPage.idealClients.map(function (c) {
      return `<li>${c}</li>`;
    }).join('');
  }
}

// Render portfolio projects
function renderProjects(projects) {
  const list = document.getElementById('project-list');
  if (!list) return;
  list.innerHTML = projects.map(function (p) {
    var image = normalizeImageUrl(p.image);
    var srcset = buildSrcset(p.image, p.webp);
    return `<li class="project-item  active" data-filter-item data-category="${p.filterCategory}">
            <a href="${p.url}" target="_blank">
              <figure class="project-img">
                <div class="project-item-icon-box">
                  <ion-icon name="eye-outline"></ion-icon>
                </div>
                ${buildImage(p, null, 'lazy')}
              </figure>
              <h3 class="project-title">${p.title}</h3>
              <p class="project-category">${p.category}</p>
            </a>
          </li>`;
  }).join('');
}

// Render blog posts
function renderBlog(blog) {
  const list = document.getElementById('blog-posts-list');
  if (!list) return;
  list.innerHTML = blog.map(function (post) {
    var image = normalizeImageUrl(post.image);
    var srcset = buildSrcset(post.image, post.webp);
    return `<li class="blog-post-item">
            <a href="${post.url}" target="_blank">
              <figure class="blog-banner-box">
                ${buildImage(post, null, 'lazy')}
              </figure>
              <div class="blog-content">
                <div class="blog-meta">
                  <p class="blog-category">${post.category}</p>
                  <span class="dot"></span>
                  <time datetime="${post.datetime}">${post.date}</time>
                </div>
                <h3 class="h3 blog-item-title">${post.title}</h3>
                <p class="blog-text">${post.excerpt}</p>
              </div>
            </a>
          </li>`;
  }).join('');
}

// Main loader
async function loadPortfolio() {
  try {
    const res = await fetch('./data.json');
    if (!res.ok) throw new Error('Failed to load data.json');
    const data = await res.json();

    renderSidebar(data.about);
    renderAboutBio(data.about.bio);
    renderAboutServices(data.services);
    renderTimeline('education-list', data.education);
    renderTimeline('experience-list', data.experience);
    renderSkills(data.skills);
    renderServicesPage(data.servicesPage);
    renderProjects(data.projects);
    renderBlog(data.blog);
  } catch (err) {
    console.error('Portfolio render error:', err);
  }
}

loadPortfolio();

function normalizeImageUrl(url) {
  if (!url) return '';
  return encodeURI(String(url).trim());
}

function normalizeWebpUrl(image, webp) {
  var w = (webp || '').trim();
  if (!w && image) w = String(image).trim().replace(/\.[^.]+$/, '.webp');
  if (w && !/\.webp($|\?)/i.test(w)) w += '.webp';
  return encodeURI(w);
}

function buildSrcset(image, webp) {
  var jpg = normalizeImageUrl(image);
  var wbp = normalizeWebpUrl(image, webp);
  var out = [];
  if (wbp) out.push(wbp + ' 1x');
  if (jpg) out.push(jpg + ' 1x');
  return out.join(', ');
}
