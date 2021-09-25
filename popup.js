console.log("chrome: ", chrome);

setTimeout(() => {
  // send message to content scripts
  chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { message: "init" });
  });

  window.close();
}, 1500);
