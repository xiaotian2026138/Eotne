const { app, BrowserWindow, BrowserView, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
let views = [];
let activeTab = 0;
let isIncognito = false;

const DATA_DIR = path.join(app.getPath('userData'), 'Eotne');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const BOOKMARKS_FILE = path.join(DATA_DIR, 'bookmarks.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const DOWNLOADS_FILE = path.join(DATA_DIR, 'downloads.json');

const errorData = require('./error_data.js');

const ERR_MAP = {
    '-2': 'ERR_FAILED', '-3': 'ERR_ABORTED', '-6': 'ERR_FILE_NOT_FOUND', '-7': 'ERR_TIMED_OUT',
    '-9': 'ERR_UNEXPECTED', '-10': 'ERR_ACCESS_DENIED', '-15': 'ERR_SOCKET_NOT_CONNECTED',
    '-20': 'ERR_BLOCKED_BY_CLIENT', '-21': 'ERR_NETWORK_CHANGED', '-100': 'ERR_CONNECTION_CLOSED',
    '-101': 'ERR_CONNECTION_RESET', '-102': 'ERR_CONNECTION_REFUSED', '-104': 'ERR_CONNECTION_FAILED',
    '-105': 'ERR_NAME_NOT_RESOLVED', '-106': 'ERR_INTERNET_DISCONNECTED', '-109': 'ERR_ADDRESS_UNREACHABLE',
    '-118': 'ERR_CONNECTION_TIMED_OUT', '-200': 'ERR_CERT_COMMON_NAME_INVALID',
    '-201': 'ERR_CERT_DATE_INVALID', '-202': 'ERR_CERT_AUTHORITY_INVALID', '-207': 'ERR_CERT_INVALID',
    '-501': 'ERR_INSECURE_RESPONSE'
};

function getWebBounds() {
    const winSize = win.getBounds();
    return { x: 0, y: 80, width: winSize.width, height: winSize.height - 80 };
}

function loadJSON(file, def) {
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {}
    return def;
}

function saveJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {}
}

let bookmarks = loadJSON(BOOKMARKS_FILE, []);
let history = loadJSON(HISTORY_FILE, []);
let downloads = loadJSON(DOWNLOADS_FILE, []);

function cleanOldHistory() {
    const now = Date.now();
    const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;
    const oldLength = history.length;
    
    history = history.filter(h => {
        const t = new Date(h.time).getTime();
        return t > sixtyDaysAgo;
    });
    
    if (history.length !== oldLength) {
        saveJSON(HISTORY_FILE, history);
        if (win && !win.isDestroyed()) {
            win.webContents.send('history-update', history);
        }
    }
}

function createWindow() {
    win = new BrowserWindow({
        width: 1280, height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile(path.join(__dirname, 'index.html'));
    win.setMenuBarVisibility(false);

    win.on('resize', () => {
        if (views[activeTab]) {
            views[activeTab].view.setBounds(getWebBounds());
        }
    });

    session.defaultSession.on('will-download', (event, item) => {
        const filename = item.getFilename();
        const savePath = path.join(app.getPath('downloads'), filename);
        item.setSavePath(savePath);

        const downloadItem = {
            id: Date.now() + Math.random(),
            filename: filename,
            path: savePath,
            size: item.getTotalBytes() || 0,
            received: 0,
            status: '下载中',
            progress: 0,
            time: new Date().toLocaleString(),
            deleted: false
        };

        downloads.unshift(downloadItem);
        saveJSON(DOWNLOADS_FILE, downloads);
        if (win && !win.isDestroyed()) win.webContents.send('download-update', downloads);

        item.on('updated', (e, state) => {
            downloadItem.received = item.getReceivedBytes();
            downloadItem.total = item.getTotalBytes();
            downloadItem.progress = item.getTotalBytes() > 0 ? Math.floor(item.getReceivedBytes() / item.getTotalBytes() * 100) : 0;
            if (state === 'interrupted') downloadItem.status = '失败';
            else downloadItem.status = '下载中';
            
            saveJSON(DOWNLOADS_FILE, downloads);
            if (win && !win.isDestroyed()) {
                win.webContents.send('download-progress', {
                    filename: filename, received: downloadItem.received, total: downloadItem.total, progress: downloadItem.progress
                });
            }
        });

        item.once('done', (e, state) => {
            if (state === 'completed') {
                downloadItem.status = '已完成';
                downloadItem.progress = 100;
                if (win && !win.isDestroyed()) win.webContents.send('download-success', { filename: filename, path: savePath });
            } else {
                downloadItem.status = '失败';
                if (win && !win.isDestroyed()) win.webContents.send('download-failed', { filename: filename, error: state });
            }
            saveJSON(DOWNLOADS_FILE, downloads);
            if (win && !win.isDestroyed()) win.webContents.send('download-update', downloads);
        });
    });

    newTab('about:blank');
}

function syncTabs() {
    const tabs = views.map((v, i) => ({ id: i, title: v.title || '新标签页', active: i === activeTab }));
    if (win && !win.isDestroyed()) win.webContents.send('tab-update', tabs);
}

function newTab(url) {
    const view = new BrowserView({
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.addBrowserView(view);
    view.setBounds({ x: 0, y: 80, width: 0, height: 0 });
    view.setAutoResize({ width: true, height: true });
    view.webContents.loadURL(url || 'about:blank');
    
    const tabInfo = { view: view, title: '新标签页' };

    view.webContents.on('did-navigate', (e, u) => {
        if (views[activeTab] && views[activeTab].view === view) {
            if (win && !win.isDestroyed()) win.webContents.send('url-changed', u);
            addHistory(u, view.webContents.getTitle());
        }
    });
    view.webContents.on('did-navigate-in-page', (e, u) => {
        if (views[activeTab] && views[activeTab].view === view) {
            if (win && !win.isDestroyed()) win.webContents.send('url-changed', u);
        }
    });
    view.webContents.on('page-title-updated', (e, t) => { tabInfo.title = t; syncTabs(); });

    view.webContents.on('did-fail-load', (e, code, desc, u, isMainFrame) => {
        if (!(views[activeTab] && views[activeTab].view === view) || isMainFrame === false || code === -3) return;
        let errKey = ERR_MAP[String(code)];
        if (!errKey && (code >= 400 && code < 600)) errKey = code;
        let errInfo = errKey ? errorData[errKey] : null;
        if (!errInfo) {
            if (errKey) errInfo = errorData['未知错误'];
            else return;
        }

      view.setBounds({ x: 0, y: 80, width: 0, height: 0 });

        if (win && !win.isDestroyed()) {
            win.webContents.send('show-error', {
                title: errInfo.title, code: errKey || code, reason: errInfo.reasons.join(';'), advice: errInfo.advice, url: u
            });
        }
    });

    view.webContents.on('did-get-response-details', (e, status, newURL, originalURL, httpResponseCode) => {
        if (!(views[activeTab] && views[activeTab].view === view) || newURL !== originalURL) return;
        if (httpResponseCode >= 400 && httpResponseCode < 600) {
            let errInfo = errorData[httpResponseCode] || errorData['未知错误'];
            if (win && !win.isDestroyed()) {
                win.webContents.send('show-error', {
                    title: errInfo.title, code: httpResponseCode, reason: errInfo.reasons.join(';'), advice: errInfo.advice, url: originalURL
                });
            }
        }
    });

    view.webContents.setWindowOpenHandler(({ url }) => { newTab(url); return { action: 'deny' }; });

    views.push(tabInfo);
    switchTab(views.length - 1);
}

function switchTab(idx) {
    if (idx < 0 || idx >= views.length) return;
    activeTab = idx;
    const currentUrl = views[idx].view.webContents.getURL();
    const isBlank = !currentUrl || currentUrl === 'about:blank';
    views.forEach((v, i) => {
        if (i === idx && !isBlank) v.view.setBounds(getWebBounds());
        else v.view.setBounds({ x: 0, y: 80, width: 0, height: 0 });
    });
    syncTabs();
}

function addHistory(url, title) {
    if (isIncognito) return;
    if (!url || url === 'about:blank') return;
    history = history.filter(h => h.url !== url);
    history.unshift({ url: url, title: title || url, time: new Date().toLocaleString() });
    if (history.length > 500) history = history.slice(0, 500);
    saveJSON(HISTORY_FILE, history);
}

ipcMain.on('load-url', (e, url) => {
    if (!views[activeTab]) return;
    views[activeTab].view.setBounds(getWebBounds());
    views[activeTab].view.webContents.loadURL(url);
});

ipcMain.on('go-back', () => { if (views[activeTab] && views[activeTab].view.webContents.canGoBack()) views[activeTab].view.webContents.goBack(); });
ipcMain.on('go-forward', () => { if (views[activeTab] && views[activeTab].view.webContents.canGoForward()) views[activeTab].view.webContents.goForward(); });
ipcMain.on('reload', () => { if (views[activeTab]) views[activeTab].view.webContents.reload(); });
ipcMain.on('new-tab', (e, url) => { newTab(url || 'about:blank'); });

ipcMain.on('close-tab', (e, id) => {
    if (id < 0 || id >= views.length) return;

    const wasActive = (id === activeTab);
    win.removeBrowserView(views[id].view);
    views[id].view.webContents.destroy();
    views.splice(id, 1);

    if (views.length === 0) { 
        newTab('about:blank'); 
        return; 
    }
    
    let newActive = activeTab;
    if (id < activeTab) newActive = activeTab - 1;
    else if (wasActive) newActive = Math.min(activeTab, views.length - 1);
    switchTab(newActive);
});

ipcMain.on('switch-tab', (e, id) => { switchTab(id); });

ipcMain.on('add-bookmark', (e, title, url) => {
    if (!url) return;
    const exists = bookmarks.find(b => b.url === url);
    if (exists) { e.sender.send('bookmark-tip', '该书签已存在'); return; }
    bookmarks.unshift({ title: title || url, url: url });
    saveJSON(BOOKMARKS_FILE, bookmarks);
    e.sender.send('bookmark-update', bookmarks);
});

ipcMain.on('get-bookmarks', (e) => { e.sender.send('bookmark-update', bookmarks); });
ipcMain.on('remove-bookmark', (e, url) => {
    bookmarks = bookmarks.filter(b => b.url !== url);
    saveJSON(BOOKMARKS_FILE, bookmarks);
    e.sender.send('bookmark-update', bookmarks);
});

ipcMain.on('get-history', (e) => {
    cleanOldHistory();
    e.sender.send('history-update', history);
});

ipcMain.on('clear-history', (e) => {
    history = [];
    saveJSON(HISTORY_FILE, history);
    e.sender.send('history-update', history);
});

ipcMain.on('get-downloads', (e) => { e.sender.send('download-update', downloads); });

ipcMain.on('open-file', (e, p) => {
    if (p && fs.existsSync(p)) shell.openPath(p);
    else e.sender.send('open-fail', '文件不存在，无法打开');
});

ipcMain.on('delete-file', (e, id) => {
    const d = downloads.find(x => String(x.id) === String(id));
    if (d) { d.deleted = true; saveJSON(DOWNLOADS_FILE, downloads); e.sender.send('download-update', downloads); }
});

ipcMain.on('restore-file', (e, id) => {
    const d = downloads.find(x => String(x.id) === String(id));
    if (d) { d.deleted = false; saveJSON(DOWNLOADS_FILE, downloads); e.sender.send('download-update', downloads); }
});

ipcMain.on('perm-delete-file', (e, id) => {
    downloads = downloads.filter(x => String(x.id) !== String(id));
    saveJSON(DOWNLOADS_FILE, downloads);
    e.sender.send('download-update', downloads);
});

ipcMain.on('open-dev-tools', () => { if (views[activeTab]) views[activeTab].view.webContents.openDevTools({ mode: 'detach' }); });

app.whenReady().then(() => {
    createWindow();
    cleanOldHistory();
    setInterval(cleanOldHistory, 60 * 60 * 1000);
});

ipcMain.on('toggle-incognito', (e, status) => {
    isIncognito = status;
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});