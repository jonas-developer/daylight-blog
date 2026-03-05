/* Theme Toggle - Dark/Light Mode with System Preference Detection */

(function() {
  const THEME_KEY = 'theme';
  const DARK_CLASS = 'dark';
  
  // Icons for toggle button
  const sunIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  const moonIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  
  function getSystemPreference() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }
  
  function getStoredTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) {
      return stored;
    }
    return getSystemPreference();
  }
  
  function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    
    // Update button icon
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.innerHTML = isDark ? sunIcon : moonIcon;
      toggleBtn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }
    
    // Store preference
    localStorage.setItem(THEME_KEY, theme);
  }
  
  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
  }
  
  // Initialize theme on page load
  function init() {
    const theme = getStoredTheme();
    applyTheme(theme);
    
    // Add toggle button if it doesn't exist
    const nav = document.querySelector('.site-nav');
    if (nav) {
      let toggleBtn = document.getElementById('theme-toggle');
      if (!toggleBtn) {
        toggleBtn = document.createElement('button');
        toggleBtn.id = 'theme-toggle';
        toggleBtn.className = 'theme-toggle';
        toggleBtn.type = 'button';
        toggleBtn.setAttribute('aria-label', 'Toggle dark/light mode');
        toggleBtn.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
        toggleBtn.addEventListener('click', toggleTheme);
        nav.appendChild(toggleBtn);
      }
    }
    
    // Listen for system preference changes
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        // Only auto-switch if user hasn't set a preference
        if (!localStorage.getItem(THEME_KEY)) {
          applyTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
  }
  
  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
