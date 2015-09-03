express-s3-router
=========

An attempt at a RESTful JSON service for working with AWS S3.  

express-s3-router is designed to be a drop in router for use in an Express app.  This means you need to setup an Express app to consume the router.  Abstracting the API to a router allows the flexibilty to configure the rest of the Express app freely.

The router provides basic CRUD operations with JSON responses for operations such such as listing all buckets, creating a bucket, deleting a bucket, getting bucket contents, creating a file, getting a file, and deleting a file.

## Installation

Install express-s3-router to your project via npm like a typical dependency.  Please note that Express is a peerDependecy so if your app will have to have that installed as well.

    npm install express-s3-router --save

## Usage

    // Setup an Express app
    var express = require('express');
    var app = express();

    // Load AWS config object from JSON file 
    var awsConfig = require('./awsConfig.json');
    
    // Create a new router using the config 
    var s3ExpressRouter = require('express-s3-router')(awsConfig);
    
    // Add the router to our app using the root url of '/buckets'
    app.use('/buckets', s3ExpressRouter);

    // Basic Express example stuff below
    app.get('/', function (req, res) {
        res.send('Hello Index!');
    });
    
    var server = app.listen(3000, function () {
        var host = server.address().address;
        var port = server.address().port;
        console.log('Example app listening at http://%s:%s', host, port);
    });
    
    
##### Notes:

1) The configuration using a JSON file is optional. There are various ways to load configurations for AWS such using environment variables. http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html

    
## Routes

| URL         | Method       | Operation                          |
|-------------|--------------|------------------------------------|
| /           | GET          | List all Buckets                   |
| /:name      | GET          | Get named bucket's contents        |
| /:name      | PUT          | Create named bucket                |
| /:name      | DELETE       | Delete named bucket                |
| /:name/:key | GET          | Get file(key) from bucket(name)    |
| /:name/:key | PUT          | Create file(key) in bucket(name)   |
| /:name/:key | DELETE       | Delete file(key) from bucket(name) |


##### Notes:

1) Strict routing is enabled for the purpose of manipulating files keys that end in slash "/".  For example a perfectly valid key is foo/ and an example request to get the object would be http://localhost:3000/buckets/foo/ Note the request also includes the trailing slash.

2) If no root url is provided the router will simply operate from /. Adding a root url means that s3Express URL endpoints will only operate on that url.  For example if you used the example above you could get all the buckets by using the url http://localhost:3000/buckets.  If instead you provided no root url then the same operation of getting all buckets would instead just be http://localhost:3000/.
    

## Contributing

In lieu of a formal styleguide, take care to maintain the existing coding style.
Add unit tests for any new or changed functionality. Lint and test your code.


## Tests
There is a Postman collection located in /test that can be used to test the API.


## Release History

* 0.1.0 Initial release