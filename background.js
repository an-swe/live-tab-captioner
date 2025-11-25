chrome.action.onClicked.addListener((tab) => {
  // Open the side panel on the current window
  chrome.sidePanel.open({ windowId: tab.windowId });
});