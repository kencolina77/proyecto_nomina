const { app, BrowserWindow } = require('electron')
const path = require('node:path')

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 760,
    minHeight: 640,
    title: 'Nómina Clara',
    backgroundColor: '#f5f8f6',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    const developmentUrl = process.env.VITE_DEV_SERVER_URL
    const isAllowed = developmentUrl
      ? url.startsWith(developmentUrl)
      : url.startsWith('file://')

    if (!isAllowed) event.preventDefault()
  })

  if (app.isPackaged) {
    void window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  } else {
    void window.loadURL('http://127.0.0.1:5173')
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.nomina.clara')
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
