'use strict';

var path = require('path')
  , basename = path.basename(__filename, '.js')
  , debug = require('debug')('castor:route:' + basename)
  , bodyParser = require('body-parser')
  , Docker = require('dockerode')
  , docker = new Docker({ socketPath: '/var/run/docker.sock' });

const util = require('util')
  , fs = require('fs');

module.exports = function(router, core) {

  var config = core.config
    , mongodb = core.connect();

  /*router.route('/').get(function(req, res, next) {
    mongodb.then(function(db) {
      db.collection('data', function(err, coll) {
        coll.count().then(function(count) {             // MongoDB API see http://mongodb.github.io/node-mongodb-native/2.0/api/Collection.html#count
          res.render("template.html", {
            name : "World",
            title: config.get('title'),                 // comes from your custom config.local.js
            appVersion: config.get('package.version'),  // comes from package.json
            appName: config.get('package.name'),        // comes from package.json
            fileRoute: 'routes/route.js',
            fileTemplate: 'views/template.html',
            nbDocs: count                               // comes form mongodb with basic query
          });
        })
      })
    }).catch(next);
  });*/

  router.route('/').get(function (req, res, next) {
    var instancesArray = fs.readdirSync(path.join(__dirname, '../instances/'));
    docker.listContainers({all : true}, function (err, containers) {

      var container = {}
        , arrayObject = [];

      (function check() {
        const elements = containers.pop();
        
        if (!elements) {
          return res.render("template.html", { 
            containers : arrayObject
          });
        }

        var splittedName = elements.Names[0].split('/');

        if (instancesArray.indexOf(splittedName[1]) === -1) { return check(); }

        var date = new Date(elements.Created * 1000)
          , img = docker.getImage(elements.Image)
          , month = (date.getMonth()+1)
          , day = date.getDate()
          , hours = date.getHours()
          , minutes = date.getMinutes()
          , jsonData = require(path.join(__dirname, '../instances', splittedName[1], '/config/data.json'));

        img.inspect(function (err, data) {
          if (err) {
            console.info(err);
            throw err;
          }

          container['title'] = jsonData.title;

          if (elements.State == 'running') { container['status'] = 'status_running'; }
          else if (elements.State == 'exited') { container['status'] = 'status_exited'; }

          elements.Image = data.RepoTags[0];
          elements.Names[0] = splittedName[1];

          if ((date.getMonth()+1) < 10) { month = '0' + (date.getMonth()+1); }
          if (date.getDate() < 10) { day = '0' + date.getDate(); }
          if (date.getHours() < 10) { hours = '0' + date.getHours(); }
          if (date.getMinutes() < 10) { minutes = '0' + date.getMinutes(); }
          elements.Created = date.getFullYear() + '/' + month + '/' + day + ' : ' + hours + 'H' + minutes;

          container['description'] = elements;

          arrayObject.push(container);

          check();
        });
      })();
    });
  });

  router.route('/-/start').post(bodyParser(), function (req, res, next) {
    var c = docker.getContainer(req.body.containerId);

    c.inspect(function (err, data) {
      if(err) {
        console.info(err);
        throw err;
      }

      console.info(data);

      if(data.State.Running == false) {
        c.start(function (err, datas, container) {
          if(err) {
            console.info(err);
            throw (err);
          }
          // send port in web client
          // res.send(200)
          // console.info(data.HostConfig.PortBindings.HostPort);
        });
      }
    });
  });

  router.route('/-/stop').post(bodyParser(), function (req, res, next) {
    var c = docker.getContainer(req.body.containerId);

    c.inspect(function (err, data) {
      if(err) {
        console.info(err);
        throw err;
      }

      if(data.State.Running == true) {
        c.stop(function (err, data, container) {
          if(err) {
            console.info(err);
            throw (err);
          }
        });
      }
    });
  });

  router.route('/-/delete').post(bodyParser(), function (req, res, next) {
    var c = docker.getContainer(req.body.containerId);
    c.stop(function (err, data, container) {
      if(err) {
        console.info(err);
        throw (err);
      }
    });
    c.remove(function (err, data, container) {
      if(err) {
        console.info(err);
        throw (err);
      }
    });
  });

  router.route('/-/addInstance').post(function (req, res, next) {
    docker.createContainer({Image: 'inistcnrs/ezvis', name: 'inistcnrs-ezvis',
     'HostConfig': {
        'Links': ['mongo_db:mongo'],
        'PortBindings': {
          '3000/tcp': [
            {
              'HostIp': '',
              'HostPort': '3001'
            }
          ]
        },
        'Binds':  [path.join(__dirname, '../instances/inistcnrs-ezvis/data')+':/root/data'
                , path.join(__dirname, '../instances/inistcnrs-ezvis/config/data.json')+':/root/data.json']
      },
      'Volumes': {
        '/root/data': {},
        '/root/data.json' : {}
      }
    },
    function (err, container) {
      container.start(function (err, data) {
        if(err) {
          console.info(err);
          throw err;
        }
        res.send(200);
      });
    });
  });

}