const { ipcRenderer } = require('electron');

window.electronAPI = {
    loadURL: (url) => ipcRenderer.send('load-url', url),
    goBack: () => ipcRenderer.send('go-back'),
    goForward: () => ipcRenderer.send('go-forward'),
    reload: () => ipcRenderer.send('reload'),

    newTab: (url) => ipcRenderer.send('new-tab', url),
    closeTab: (id) => ipcRenderer.send('close-tab', id),
    switchTab: (id) => ipcRenderer.send('switch-tab', id),

    addBookmark: (title, url) => ipcRenderer.send('add-bookmark', title, url),
    getBookmarks: () => ipcRenderer.send('get-bookmarks'),
    removeBookmark: (url) => ipcRenderer.send('remove-bookmark', url),

    getHistory: () => ipcRenderer.send('get-history'),
    clearHistory: () => ipcRenderer.send('clear-history'),

    getDownloads: () => ipcRenderer.send('get-downloads'),
    openFile: (p) => ipcRenderer.send('open-file', p),
    deleteFile: (n) => ipcRenderer.send('delete-file', n),
    restoreFile: (n) => ipcRenderer.send('restore-file', n),
    permDeleteFile: (n) => ipcRenderer.send('perm-delete-file', n),

    openDevTools: () => ipcRenderer.send('open-dev-tools'),

    onURLChange: (callback) => ipcRenderer.on('url-changed', (event, url) => callback(url)),
    onBookmarkUpdate: (callback) => ipcRenderer.on('bookmark-update', (event, bookmarks) => callback(bookmarks)),
    onHistoryUpdate: (callback) => ipcRenderer.on('history-update', (event, history) => callback(history)),
    onDownloadUpdate: (callback) => ipcRenderer.on('download-update', (event, downloads) => callback(downloads)),
    onShowError: (callback) => ipcRenderer.on('show-error', (event, data) => callback(data)),
    onTabUpdate: (callback) => ipcRenderer.on('tab-update', (event, tabs) => callback(tabs)),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, data) => callback(data)),
    onDownloadSuccess: (callback) => ipcRenderer.on('download-success', (event, data) => callback(data)),
    onDownloadFailed: (callback) => ipcRenderer.on('download-failed', (event, data) => callback(data)),
    onOpenFail: (callback) => ipcRenderer.on('open-fail', (event, msg) => callback(msg)),
    onBookmarkTip: (callback) => ipcRenderer.on('bookmark-tip', (event, msg) => callback(msg))
};
