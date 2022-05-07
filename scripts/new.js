var exec = require('child_process').exec

hexo.on('new', function (data) {
  exec('code ' + data.path)
})