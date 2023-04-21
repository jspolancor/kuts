const electronInstaller = require('electron-winstaller');
const path = require('path')

console.log('creating windows installer')

const rootPath = path.join('./')
const outPath = path.join(rootPath, 'release-builds')
var resultPromise = electronInstaller.createWindowsInstaller({
  appDirectory: path.join(outPath, 'Kuts-win32-ia32/'),
  authors: 'Juan Polanco',
  outputDirectory: path.join(outPath, 'windows-installer'),
  exe: 'kuts.exe',
  setupIcon: path.join(rootPath, 'icons', 'win', 'logo-icon.png.ico')
});

resultPromise.then(() => console.log("It worked!"), (e) => console.log(`No dice: ${e.message}`));

