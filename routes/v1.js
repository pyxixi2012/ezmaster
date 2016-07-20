/*eslint-env node */
/*eslint no-sync: "off", global-require: "off"*/
'use strict';

var path = require('path')
  , basename = path.basename(__filename, '.js')
  , debug = require('debug')('ezmaster:' + basename)
  , bodyParser = require('body-parser')
  , fs = require('fs')
  , getSize = require('get-folder-size')
  , filesize = require('filesize')
  , Docker = require('dockerode')
  , docker = new Docker({ socketPath: '/var/run/docker.sock'})
  , exec = require('child_process').exec
  , jsonfile = require('jsonfile')
  , mkdirp = require('mkdirp')
  , rimraf = require('rimraf')
  , fileExists = require('file-exists')
  , instances = require('../helpers/instances')
  , instancesArray
  , containers
  , portMax
  , freePortSplitted
  ;

// The bool to check if the instances cache is up to date.
var instancesChangesBool = true;

jsonfile.spaces = 2;



module.exports = function (router, core) {

  router.route('/').get(function (req, res, next) {

    return res.render('template.html');

  });



  router.route('/-/v1/instances').get(function (req, res, next) {

    instances.getInstances(instancesChangesBool, function (err, data) {

      if (err) { return next(err); }

      debug(data);
      return res.status(200).send(data);

    });

    // instancesChangesBool set to false because the cache is up to date.
    instancesChangesBool = false;

  });



  router.route('/-/v1/instances/:containerId').put(bodyParser(), function (req, res, next) {
    var container = docker.getContainer(req.params.containerId);

    container.inspect(function (err, data) {
      if (err) { return next(err); }
      if (req.body.action == 'start' && data.State.Running == false) {
        container.start(function (err, datas, container) {
          if (err) { return next(err); }

          // When an instance is started, we call refreshInstances() to update
          // the instances list cache and socket emit the updated list to all users.
          // The 'core' parameter allows to get the socket object inside refreshInstances().
          instances.refreshInstances(core);

          res.status(200).send('Starting done');
        });
      }
      else if (req.body.action == 'stop' && data.State.Running == true) {
        container.stop(function (err, datas, container) {
          if (err) { return next(err); }

          // When an instance is stopped, we call refreshInstances() to update the
          // instances list cache and socket emit the updated list to all users.
          // The 'core' parameter allows to get the socket object inside refreshInstances().
          instances.refreshInstances(core);

          res.status(200).send('Stoping done');
        });
      }
      else if (req.body.action == 'updateConfig') {
        var splittedName = data.Name.split('/');

        jsonfile.writeFile(
          path.join(__dirname, '../instances/', splittedName[1], '/config/config.json'),
          req.body.newConfig, function (err) {

            if (err) { return next(err); }

            if (data.State.Running == true) {
              container.restart(function (err) {
                if (err) { return next(err); }
                res.status(200).send('Update done');
              });
            }
            else {
              res.status(200).send('Update done');
            }
          });

        // When a new config is given to an instance, we call refreshInstances() to update the
        // instances list cache and socket emit the updated list to all users.
        // The 'core' parameter allows to get the socket object inside refreshInstances().
        instances.refreshInstances(core);

      }
    });
  });



  router.route('/-/v1/instances/verif').get(bodyParser(), function (req, res, next) {
    if (fileExists(path.join(__dirname, '../manifests/'
      +req.query.technicalName+'.json')) == false) {
      res.status(200).send('Technical name does not exists');
    }
    else {
      res.status(409).send('Technical name '+req.query.technicalName+' already exists');
    }
  });



  router.route('/-/v1/instances/:containerId').get(bodyParser(), function (req, res, next) {
    var container = docker.getContainer(req.params.containerId);

    container.inspect(function (err, data) {
      if (err) { return next(err); }

      var splittedName = data.Name.split('/');

      if (req.query.action == 'info') {
        var directoryDatas = path.join(__dirname, '../instances/', splittedName[1], '/data/')
          , result = {};

        getSize(directoryDatas, function (err, size) {
          if (err) { return next(err); }

          result['technicalName'] = splittedName[1];
          result['size'] = filesize(size);

          return res.status(200).send(result);
        });
      }
      else if (req.query.action == 'config') {
        jsonfile.readFile(
        path.join(__dirname, '../instances/', splittedName[1], '/config/config.json'),
        function (err, obj) {

          if (err) { return next(err); }

          return res.status(200).send(obj);
        });
      }
    });
  });



  router.route('/-/v1/instances/:containerId').delete(function (req, res, next) {
    var container = docker.getContainer(req.params.containerId);

    container.inspect(function (err, data) {
      if (err) { return next(err); }

      if (data.State.Running == true) {
        container.stop(function (err, datas, cont) {
          if (err) { return next(err); }

          container.remove(function (err, datas, cont) {
            if (err) { return next(err); }
          });
        });
      }
      else if (data.State.Running == false) {
        container.remove(function (err, datas, cont) {
          if (err) { return next(err); }
        });
      }

      var splittedName = data.Name.split('/');
      rimraf(path.join(__dirname, '../instances/', splittedName[1]), function (err) {
        if (err) { return next(err); }

        rimraf(path.join(__dirname, '../manifests/', splittedName[1] + '.json'), function (err) {
          if (err) { return next(err); }

          // When an instance is deleted, we call refreshInstances() to update the
          // instances list cache and socket emit the updated list to all users.
          // The 'core' parameter allows to get the socket object inside refreshInstances().
          instances.refreshInstances(core);

          res.status(200).send('Removing done');
        });
      });
    });


  });



  router.route('/-/v1/instances').post(bodyParser(), function (req, res, next) {

    var technicalName = req.body.technicalName
      , longName = req.body.longName
      , image = req.body.app
      , project = req.body.project
      , study = req.body.study
      ;


    if (/^[a-z0-9]+$/.test(project) == false && project != '' && project != null) {

      return res.status(400).send('Enter a valid project name');

    }


    if (/^[a-z0-9]+$/.test(study) == false && study != '' && study != null) {

      return res.status(400).send('Enter a valid study name');

    }


    if (fileExists(path.join(__dirname, '../manifests/'+req.query.technicalName+'.json')) == true) {

      res.status(409).send('Technical name already exists');

    }
    else {

      docker.pull(image, follow);

    }


    function follow(err, stream) {
      if (err) { return res.status(400).send(err); }

      docker.modem.followProgress(stream, onFinished);

    }


    function onFinished(err, output) {
      if (err) { return res.status(400).send(err); }

      mkdirp(path.join(__dirname, '../instances/'+technicalName+'/config/'), makeDataDirectory);
    }


    function makeDataDirectory(err) {
      if (err) { return next(err); }

      mkdirp(path.join(__dirname, '../instances/'+technicalName+'/data/'), createConfigFile);
    }


    function createConfigFile(err) {
      if (err) { return next(err); }

      fs.appendFile(
        path.join(
          __dirname, '../instances/'+technicalName+'/config/config.json'
        )
        , '{}'
        , readInstances
      );
    }


    function readInstances(err) {
      if (err) { return next(err); }

      instancesArray = fs.readdirSync(path.join(__dirname, '../instances/'));

      docker.listContainers({all : true}, createInstance);
    }


    function createInstance(err, containersList) {
      if (err) { return next(err); }

      containers = containersList;

      portMax = 0;
      freePortSplitted = process.env.EZMASTER_FREE_PORT_RANGE.split('-');

      checkContainer();
    }


    function checkContainer() {
      var element = containers.pop();

      if (element) {
        var splittedName = element.Names[0].split('/');
        if (instancesArray.indexOf(splittedName[1]) === -1) {
          return checkContainer();
        }

        var container = docker.getContainer(element.Id);

        container.inspect(checkPort);
      }
      else {
        debug(portMax);
        if (!Number.isInteger(portMax) || portMax == 0) {
          portMax = freePortSplitted[0];
        }

        var cmd = 'docker run -d -p '+portMax+':3000 ' +
        '-e http_proxy -e https_proxy -e EZMASTER_MONGODB_HOST_PORT '+
        '--net=ezmaster_default --link ezmaster_db '+
        '-v '+process.env.EZMASTER_PATH+'/instances/'+
        technicalName+'/config/config.json:'+'/opt/ezmaster/config/config.json '+
        '-v '+process.env.EZMASTER_PATH+'/instances/'
        +technicalName+'/data/:/opt/ezmaster/data/ '+
        '--name '+technicalName+' '+image;

        var newlongName = {
          'longName' : longName
        };
        jsonfile.writeFile(
          path.join(__dirname, '../manifests/'+technicalName+'.json')
          , newlongName, function (err) {
            if (err) { return next(err); }
          });

        exec(cmd, refreshAndReturn);
      }
    }


    function checkPort(err, data) {
      if (err) { return next(err); }

      var keys =  Object.keys(data.HostConfig.PortBindings);
      var currentPort = data.HostConfig.PortBindings[keys[0]][0].HostPort;

      if (currentPort >= portMax) {
        portMax = parseInt(currentPort) + 1;
      }

      return checkContainer();
    }


    function refreshAndReturn(err, stdout, stderr) {
      if (err) { return next(err); }

      // When an instance is created, we call refreshInstances() to update the
      // instances list cache and socket emit the updated list to all users.
      // The 'core' parameter allows to get the socket object inside
      // refreshInstances().
      instances.refreshInstances(core);

      return res.status(200).send('Instance created');
    }

  }); // End of the route.



}; // End of module.exports = function (router, core) {