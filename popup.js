document.addEventListener('DOMContentLoaded', () => {
  const tabList = document.getElementById('tabList');
  const toggleMuteButton = document.getElementById('toggleMute');
  const timerInput = document.getElementById('timerMinutes');
  const activeTimersList = document.getElementById('activeTimersList');
  let selectedTabs = new Set(); // Set of selected tab IDs
  let activeTimers = new Map(); // Map of tabId -> {timer, endTime, tabTitle, favicon}

  // Initialize app

  // Function to update button text based on selection
  function updateButtonState() {
    const anySelected = selectedTabs.size > 0;
    const minutes = parseInt(timerInput.value) || 5;
    toggleMuteButton.disabled = !anySelected;
    toggleMuteButton.textContent = `Mute ${selectedTabs.size} tab${selectedTabs.size !== 1 ? 's' : ''} for ${minutes} minute${minutes !== 1 ? 's' : ''}`;

  }

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
      chrome.tabs.update(tabId, { muted: false });
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
      chrome.tabs.update(tabId, { muted: false });
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
        <div class="timer-top-row">
          <div class="title">
            <img class="favicon" src="${timerInfo.favicon || 'icons/icon16.png'}" alt="">
            <span>${timerInfo.tabTitle}</span>
          </div>
          <span class="time">${minutes}:${seconds.toString().padStart(2, '0')}</span>
        </div>
        <div class="timer-bottom-row">
          <button class="timer-button add-time">+5m</button>
          <button class="timer-button subtract-time">-5m</button>
          <button class="timer-button stop-button">Stop</button>
        </div>
      `;

      // Add event listeners for timer controls
      const addButton = timerElement.querySelector('.add-time');
      const subtractButton = timerElement.querySelector('.subtract-time');
      const stopButton = timerElement.querySelector('.stop-button');

      addButton.addEventListener('click', () => {
        adjustTimer(tabId, 5);
      });

      subtractButton.addEventListener('click', () => {
        adjustTimer(tabId, -5);
      });

      stopButton.addEventListener('click', () => stopTimer(tabId));
      
      activeTimersList.appendChild(timerElement);
    });
  }

  // Update timers display every second
  setInterval(updateTimersList, 1000);

  // Function to create tab elements
  function createTabElement(tab) {
    const tabElement = document.createElement('div');
    tabElement.className = 'tab-item';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.tabId = tab.id;
    checkbox.checked = selectedTabs.has(tab.id);
    
    const tabContent = document.createElement('div');
    tabContent.className = 'tab-content';
    
    const favicon = document.createElement('img');
    favicon.className = 'tab-favicon';
    favicon.src = tab.favIconUrl || 'icons/icon16.png';
    favicon.alt = '';
    
    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title;
    
    tabContent.appendChild(favicon);
    tabContent.appendChild(title);
    tabElement.appendChild(checkbox);
    tabElement.appendChild(tabContent);

    // Handle checkbox changes
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedTabs.add(tab.id);
      } else {
        selectedTabs.delete(tab.id);
      }
      updateButtonState();
    });

    // Handle clicking anywhere on the tab item
    tabElement.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        if (checkbox.checked) {
          selectedTabs.add(tab.id);
        } else {
          selectedTabs.delete(tab.id);
        }
        updateButtonState();
      }
    });

    return tabElement;
  }

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
      // Add window separator and select all checkbox
      if (windowIndex > 0) {
        const separator = document.createElement('div');
        separator.className = 'window-separator';
        tabList.appendChild(separator);
      }
      
      // Add window label and select all checkbox inline
      // Create a single flex container for window label and select all
      const windowHeader = document.createElement('div');
      windowHeader.style.display = 'flex';
      windowHeader.style.alignItems = 'center';
      windowHeader.style.gap = '10px';
      windowHeader.style.marginBottom = '4px';

      const windowLabel = document.createElement('div');
      windowLabel.className = 'window-label';
      windowLabel.textContent = `Window ${windowIndex + 1}`;

      const selectAllCheckbox = document.createElement('input');
      selectAllCheckbox.type = 'checkbox';
      selectAllCheckbox.id = `select-all-${windowId}`;
      selectAllCheckbox.style.marginLeft = '10px';
      selectAllCheckbox.style.marginRight = '4px';
      const selectAllLabel = document.createElement('label');
      selectAllLabel.htmlFor = `select-all-${windowId}`;
      selectAllLabel.textContent = 'Select all';

      windowHeader.appendChild(windowLabel);
      windowHeader.appendChild(selectAllLabel);
      selectAllLabel.style.whiteSpace = 'nowrap';
      windowHeader.appendChild(selectAllCheckbox);
      tabList.appendChild(windowHeader);

      // Handle select all functionality
      selectAllCheckbox.addEventListener('change', (e) => {
        const windowCheckboxes = windowTabs.map(tab => 
          document.querySelector(`input[data-tab-id="${tab.id}"]`)
        ).filter(Boolean);
        
        windowCheckboxes.forEach(checkbox => {
          checkbox.checked = e.target.checked;
          const tabId = parseInt(checkbox.dataset.tabId);
          if (e.target.checked) {
            selectedTabs.add(tabId);
          } else {
            selectedTabs.delete(tabId);
          }
        });
        updateButtonState();
      });

      // Add tabs for this window
      windowTabs.forEach(tab => {
        tabList.appendChild(createTabElement(tab));
      });
    });
  });

  // Handle mute button click
  toggleMuteButton.addEventListener('click', () => {
    const minutes = parseInt(timerInput.value) || 5;
    const duration = minutes * 60 * 1000; // Convert to milliseconds

    // Mute all selected tabs
    selectedTabs.forEach(tabId => {
      chrome.tabs.update(tabId, { muted: true }, (tab) => {
        const timer = setTimeout(() => {
          chrome.tabs.update(tabId, { muted: false });
          removeTimer(tabId);
        }, duration);

        chrome.tabs.get(tabId, (tab) => {
          activeTimers.set(tabId, {
            timer,
            endTime: Date.now() + duration,
            tabTitle: tab.title,
            favicon: tab.favIconUrl
          });
          saveTimers();
          updateTimersList();
        });
      });
    });

    // Clear selections after starting timers
    selectedTabs.clear();
    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      checkbox.checked = false;
    });
    updateButtonState();
  });

  // Add event listeners for timer adjustment buttons
  const increaseTimeBtn = document.getElementById('increaseTime');
  const decreaseTimeBtn = document.getElementById('decreaseTime');
  
  increaseTimeBtn.addEventListener('click', () => {
    let currentValue = parseInt(timerInput.value) || 5;
    if (currentValue < 120) {
      timerInput.value = currentValue + 1;
      updateButtonState();
    }
  });
  
  decreaseTimeBtn.addEventListener('click', () => {
    let currentValue = parseInt(timerInput.value) || 5;
    if (currentValue > 1) {
      timerInput.value = currentValue - 1;
      updateButtonState();
    }
  });

  // Update button text when timer input changes
  timerInput.addEventListener('input', updateButtonState);

  // Load saved timers when popup opens
  loadSavedTimers();
});