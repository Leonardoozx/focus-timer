import { getTranslation } from './translations';

document.addEventListener('DOMContentLoaded', () => {
  const tabList = document.getElementById('tabList');
  const toggleMuteButton = document.getElementById('toggleMute');
  const timerInput = document.getElementById('timerMinutes');
  const activeTimersList = document.getElementById('activeTimersList');
  let selectedTabId = null;
  let activeTimers = new Map(); // Map of tabId -> {timer, endTime, tabTitle, favicon}

  // Get user's preferred language from storage or browser
  let currentLang = 'en';
  chrome.storage.local.get('language', (result) => {
    currentLang = result.language || navigator.language.split('-')[0] || 'en';
    if (!['en', 'pt'].includes(currentLang)) currentLang = 'en';
    updateLanguage(currentLang);
  });

  // Load saved timers from storage
  async function loadSavedTimers() {
    const data = await chrome.storage.local.get('timers');
    const savedTimers = data.timers || {};
    
    // Convert saved timers back to active timers
    Object.entries(savedTimers).forEach(([tabId, timerInfo]) => {
      tabId = Number(tabId);
      const timeLeft = timerInfo.endTime - Date.now();
      
      // Only restore timer if it hasn't expired
      if (timeLeft > 0) {
        const timer = setTimeout(() => {
          chrome.tabs.update(tabId, { muted: false });
          removeTimer(tabId);
        }, timeLeft);

        activeTimers.set(tabId, {
          timer,
          endTime: timerInfo.endTime,
          tabTitle: timerInfo.tabTitle,
          favicon: timerInfo.favicon
        });
      } else {
        // If timer has expired, unmute the tab
        chrome.tabs.update(tabId, { muted: false });
      }
    });
    
    updateTimersList();
  }

  // Save timers to storage
  async function saveTimers() {
    const timersToSave = {};
    activeTimers.forEach((timerInfo, tabId) => {
      timersToSave[tabId] = {
        endTime: timerInfo.endTime,
        tabTitle: timerInfo.tabTitle,
        favicon: timerInfo.favicon
      };
    });
    await chrome.storage.local.set({ timers: timersToSave });
  }

  // Remove a timer and update storage
  async function removeTimer(tabId) {
    if (activeTimers.has(tabId)) {
      clearTimeout(activeTimers.get(tabId).timer);
      activeTimers.delete(tabId);
      await saveTimers();
      updateTimersList();
    }
  }

  // Adjust timer duration
  async function adjustTimer(tabId, minutes) {
    if (!activeTimers.has(tabId)) return;

    const timerInfo = activeTimers.get(tabId);
    const currentTimeLeft = timerInfo.endTime - Date.now();
    const adjustmentMs = minutes * 60 * 1000;
    const newTimeLeft = Math.max(0, currentTimeLeft + adjustmentMs);

    // Clear existing timer
    clearTimeout(timerInfo.timer);

    if (newTimeLeft <= 0) {
      // If no time left, stop the timer
      chrome.tabs.update(tabId, { muted: false }, (tab) => {
        if (tabId === selectedTabId) {
          updateButtonText(false);
        }
      });
      removeTimer(tabId);
      return;
    }

    // Create new timer
    const timer = setTimeout(() => {
      chrome.tabs.update(tabId, { muted: false });
      removeTimer(tabId);
    }, newTimeLeft);

    // Update timer info
    activeTimers.set(tabId, {
      timer,
      endTime: Date.now() + newTimeLeft,
      tabTitle: timerInfo.tabTitle,
      favicon: timerInfo.favicon
    });

    await saveTimers();
    updateTimersList();
  }

  function stopTimer(tabId) {
    if (activeTimers.has(tabId)) {
      const timerInfo = activeTimers.get(tabId);
      clearTimeout(timerInfo.timer);
      chrome.tabs.update(tabId, { muted: false }, (tab) => {
        if (tabId === selectedTabId) {
          updateButtonText(false);
        }
      });
      removeTimer(tabId);
    }
  }

  function updateTimersList() {
    activeTimersList.innerHTML = '';
    
    if (activeTimers.size === 0) {
      activeTimersList.innerHTML = '<div class="no-timers">No active timers</div>';
      return;
    }

    activeTimers.forEach((timerInfo, tabId) => {
      const timeLeft = Math.max(0, Math.ceil((timerInfo.endTime - Date.now()) / 1000));
      const minutes = Math.floor(timeLeft / 60);
      const seconds = timeLeft % 60;
      
      const timerElement = document.createElement('div');
      timerElement.className = 'timer-item';
      timerElement.innerHTML = `
        <div class="title">
          <img class="favicon" src="${timerInfo.favicon || 'icons/icon16.png'}" alt="">
          <span>${timerInfo.tabTitle}</span>
        </div>
        <div class="timer-info">
          <span class="time">${minutes}:${seconds.toString().padStart(2, '0')}</span>
          <div class="timer-controls">
            <input type="number" class="timer-adjust-input" value="5" min="1" max="60">
            <button class="timer-button add-time">+</button>
            <button class="timer-button subtract-time">-</button>
            <button class="timer-button stop-button">Stop</button>
          </div>
        </div>
      `;

      // Add event listeners for timer controls
      const adjustInput = timerElement.querySelector('.timer-adjust-input');
      const addButton = timerElement.querySelector('.add-time');
      const subtractButton = timerElement.querySelector('.subtract-time');
      const stopButton = timerElement.querySelector('.stop-button');

      addButton.addEventListener('click', () => {
        const minutes = Number(adjustInput.value) || 5;
        adjustTimer(tabId, minutes);
      });

      subtractButton.addEventListener('click', () => {
        const minutes = Number(adjustInput.value) || 5;
        adjustTimer(tabId, -minutes);
      });

      stopButton.addEventListener('click', () => stopTimer(tabId));
      
      activeTimersList.appendChild(timerElement);
    });
  }

  // Update timers display every second
  setInterval(updateTimersList, 1000);

  // Load and display all tabs across all windows
  chrome.tabs.query({}, (tabs) => {
    // Group tabs by window
    const tabsByWindow = tabs.reduce((acc, tab) => {
      if (!acc[tab.windowId]) {
        acc[tab.windowId] = [];
      }
      acc[tab.windowId].push(tab);
      return acc;
    }, {});

    // Display tabs grouped by window
    Object.entries(tabsByWindow).forEach(([windowId, windowTabs], windowIndex) => {
      // Add window separator
      if (windowIndex > 0) {
        const separator = document.createElement('div');
        separator.className = 'window-separator';
        tabList.appendChild(separator);
      }

      // Add window label
      const windowLabel = document.createElement('div');
      windowLabel.className = 'window-label';
      windowLabel.textContent = `Window ${windowIndex + 1}`;
      tabList.appendChild(windowLabel);

      // Add tabs for this window
      windowTabs.forEach(tab => {
        const tabElement = document.createElement('div');
        tabElement.className = 'tab-item';
        tabElement.innerHTML = `
          <input type="radio" name="tab" value="${tab.id}">
          <div class="tab-content">
            <img class="tab-favicon" src="${tab.favIconUrl || 'icons/icon16.png'}" alt="">
            <span class="tab-title">${tab.title}</span>
          </div>
        `;
        
        const radio = tabElement.querySelector('input');
        radio.addEventListener('change', () => {
          selectedTabId = tab.id;
          updateButtonText(tab.mutedInfo.muted);
        });

        if (tab.active && windowIndex === 0) {
          radio.checked = true;
          selectedTabId = tab.id;
          updateButtonText(tab.mutedInfo.muted);
        }

        tabList.appendChild(tabElement);
      });
    });
  });

  // Toggle mute button click handler
  toggleMuteButton.addEventListener('click', () => {
    if (!selectedTabId) return;

    chrome.tabs.get(selectedTabId, (tab) => {
      // If we're unmuting, clear any active timer
      if (tab.mutedInfo.muted) {
        if (activeTimers.has(selectedTabId)) {
          removeTimer(selectedTabId);
        }
      } else {
        // If we're muting, start the timer
        const minutes = Number(timerInput.value) || 5;
        const endTime = Date.now() + (minutes * 60 * 1000);
        
        const timer = setTimeout(() => {
          chrome.tabs.update(selectedTabId, { muted: false });
          removeTimer(selectedTabId);
        }, minutes * 60 * 1000);

        activeTimers.set(selectedTabId, {
          timer,
          endTime,
          tabTitle: tab.title,
          favicon: tab.favIconUrl
        });
        saveTimers();
        updateTimersList();
      }

      // Toggle the mute state
      chrome.tabs.update(selectedTabId, { 
        muted: !tab.mutedInfo.muted 
      }, (updatedTab) => {
        updateButtonText(updatedTab.mutedInfo.muted);
      });
    });
  });

  // Update button text based on mute state
  function updateButtonText(isMuted) {
    toggleMuteButton.textContent = isMuted ? 'Unmute Tab' : 'Mute Tab';
  }

  // Load saved timers when popup opens
  loadSavedTimers();

  // Language switching functionality
  function updateLanguage(lang) {
    currentLang = lang;
    const t = getTranslation(lang);
    
    // Save language preference
    chrome.storage.local.set({ language: lang });
    
    // Update active button state
    document.querySelectorAll('.lang-button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    
    // Update all text content
    document.querySelector('.header h1').textContent = t.headerTitle;
    document.querySelector('.header p').textContent = t.headerSubtitle;
    document.querySelectorAll('.window-label').forEach(el => {
      el.textContent = `${t.windowLabel} ${el.dataset.windowId}`;
    });
    document.querySelector('.timer-label').textContent = t.timerLabel;
    document.querySelector('#toggleButton').textContent = t.toggleMute;
    
    // Update active timers section
    const activeTimersTitle = document.querySelector('.active-timers h3');
    if (activeTimersTitle) {
      activeTimersTitle.textContent = t.activeTimersTitle;
    }
    
    // Update support section
    document.querySelector('.support-text').textContent = t.supportText;
    document.querySelector('.coffee-button').textContent = t.supportButton;
    
    // Update no timers message if present
    const noTimersMsg = document.querySelector('.no-timers');
    if (noTimersMsg) {
      noTimersMsg.textContent = t.noActiveTimers;
    }
    
    // Update all time remaining text
    document.querySelectorAll('.time').forEach(el => {
      const minutes = el.dataset.minutes;
      el.textContent = `${t.timeRemaining}: ${minutes} ${t.minutes}`;
    });
  }

  // Add event listeners for language buttons
  document.querySelectorAll('.lang-button').forEach(button => {
    button.addEventListener('click', () => {
      updateLanguage(button.dataset.lang);
    });
  });
});