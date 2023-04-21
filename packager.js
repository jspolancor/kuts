const packager = require('electron-packager')

function packageMac(){
    packager({
        dir: '.',
        overwrite: true,
        platform: 'darwin',
        arch: 'x64',
        asar: true,
        icon: 'icons/mac/logo-icon.png.icns',
        prune: true,
        out: 'release-builds',
        ignore: [
            'styles',
            'functions',
            'firebase.json',
            'packager.js',
            'gulpfile.js',
            'package.json',
            'package-lock.json',
            'node_modules/ffmpeg-static/bin/win32',
            'node_modules/ffmpeg-static/bin/linux',
            'node_modules/ffprobe-static/bin/win32',
            'node_modules/ffprobe-static/bin/linux'
        ],
    })
    .then(appPaths => {
        console.log('Kuts packaged for mac');
    })
}

function packageWin(){
    packager({
        dir: '.',
        overwrite: true,
        asar: true,
        platform: 'win32',
        arch: 'ia32',
        icon: 'icons/win/logo-icon.png.ico',
        prune: true,
        out: 'release-builds',
        productName: 'Kuts',

        ignore: [
            'styles',
            'functions',
            'firebase.json',
            'packager.js',
            'gulpfile.js',
            'package.json',
            'package-lock.json',
            'node_modules/ffmpeg-static/bin/darwin',
            'node_modules/ffmpeg-static/bin/linux',
            'node_modules/ffprobe-static/bin/darwin',
            'node_modules/ffprobe-static/bin/linux'
        ],
    })
    .then(appPaths => {
        console.log('Kuts packaged for win');
    })
}

packageMac();
