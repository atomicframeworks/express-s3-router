/*jslint es5: true */
/*global
    require, module, console
*/
(function () {
    'use strict';

    module.exports = function (config) {
        // Set strict routing that /buckets/test/abc is not the same as /buckets/test/abc/
        // adding the slash at the end denotes creating a folder and not a file
        var router = require('express').Router({strict: true}),
            AWS = require('aws-sdk'),
            extend = require('util')._extend,
            url = require('url'),
            DEFAULT_MAX_KEYS = 1000,
            
            // Return a location like object representing the request url
            getLocation = function (req) {
                var protocol = req.secure ? 'https://' : 'http://',
                    hostname = req.headers.host,
                    originalUrl = req.originalUrl !== '/' ? req.originalUrl : '',
                    fullUrl = protocol + hostname + originalUrl,
                    // Split out the query string
                    urlParts = fullUrl.split('?'),
                    origin = urlParts[0],
                    search = urlParts[1] ? '?' + urlParts[1] : '';
                return {
                    // Protocol, hostname and port 
                    origin: origin,
                    // Query string
                    search: search,
                    protocol: protocol,
                    hostname: hostname,
                    href: originalUrl
                };
            },
            // Merge the two objects and create search query string with them
            getMergedSearch = function (searchParams, otherParams) {
                var mergedParams = extend(searchParams, otherParams),
                    paramKey,
                    searchString = '';
                
                for (paramKey in mergedParams) {
                    if (mergedParams.hasOwnProperty(paramKey)) {
                        if (!searchString) {
                            searchString += '?' + paramKey + '=' + mergedParams[paramKey];
                        } else {
                            searchString += '&' + paramKey + '=' + mergedParams[paramKey];
                        }
                    }
                }
                
                return searchString;
            },
            getNextMarkerLink = function (req, nextMarker) {
                var location = getLocation(req);
                
                // Merge marker property with existing queries
                location.search = getMergedSearch(req.query, {
                    marker: nextMarker
                });
                
                return location.origin + location.search;
            },
            getS3ObjectLink = function (req, bucket, content) {
                var location = getLocation(req),
                    href = location.origin;
                
                // If the objectKey is a folder we want to get a url to the bucket with a prefix param
                if (content.Key.substr(-1) === '/' && content.Size === 0) {
                    // Merge marker property with existing queries
                    location.search = getMergedSearch(req.query, {
                        prefix: encodeURI(content.Key)
                    });
                    href += location.search;
                } else {
                // Since we are getting a link for an item the href must end with slash
                    if (href.substr(-1) !== '/') {
                        href += '/';
                    }
                    href += encodeURI(content.Key);
                }
                
                return href;
            },
            getBucketLink = function (req, bucket) {
                var location = getLocation(req),
                    href = location.origin;

                // Since we are getting a link for an item the href must end with slash
                if (href.substr(-1) !== '/') {
                    href += '/';
                }
                
                // Add the bucket and search
                href += bucket + location.search;

                return href;
            },
            getOriginalink = function (req) {
                var location = getLocation(req),
                    href = location.origin + location.search;
                return href;
            },
            getFullKeyParam = function (params, route) {
                // Due to how our routing accepts arbitrary length folders 
                // The key param could be split between params.key and params.'0'
                // Return the combined keys
                var restOfKey = params['0'] || '';

                var key = params.key + restOfKey;

                // Check if this route ends with a / ensure the key also does (similar to strict routing)
                if (route.path.slice(-1) === '/' && key.slice(-1) !== '/') {
                    key = key + '/';
                }

                return key;
            },
            // Get all buckets
            listBuckets = function (req, res) {
                var s3 = new AWS.S3(),
                    handleListBuckets = function (err, data) {
                        if (err) {
                            res.status(500).send(err);
                        } else {
                            // Add link
                            data.Buckets.forEach(function (bucket) {
                                bucket.links = [{
                                    rel: 'self',
                                    href: getBucketLink(req, bucket.Name)
                                }];
                            });
                            
                            res.json(data.Buckets);
                        }
                    };
                
                s3.listBuckets(handleListBuckets);
            },
            // Get a bucket
            getBucket = function (req, res) {
                var s3 = new AWS.S3(),
                    bucket = req.params.name,
                    location = getLocation(req),
                    params = {
                        Bucket: bucket,
                        Delimiter: req.query.delimiter,
                        Marker: req.query.marker,
                        MaxKeys: req.query.maxKeys || DEFAULT_MAX_KEYS,
                        Prefix: req.query.prefix
                    },
                    handleListObjects = function (err, data) {
                        if (err) {
                            res.status(500).send(err);
                        } else {
                              
                            // Get link for this set
                            data.links = [{
                                rel: 'self',
                                href: getOriginalink(req)
                            }];
                            
                            // Map through bucket contents to filter out self reference and add links
                            data.Contents = data.Contents.map(function (content) {
                                // Add s3g link to reference the resource
                                content.links = [{
                                    ref: 'self',
                                    href: getS3ObjectLink(req, bucket, content)
                                }];
                                
                                // Filter out any references to the parent file
                                if (location.origin + location.search !== content.links[0].href) {
                                    return content;
                                }
                                
                            }).filter(Boolean);
                            
                            
                            // If this set of objects has a next marker that means there are > 1000 so provide the link to the next set of data
                            if (data.IsTruncated) {
                                // Get link for next set using next marker if available or the last key in the content set
                                data.links.push({
                                    rel: 'next',
                                    href: getNextMarkerLink(req, data.NextMarker || data.Contents[data.Contents.length - 1].Key)
                                });
                            }
                            res.json(data);
                        }
                    };
                
                s3.listObjects(params, handleListObjects);
            },
            // Create a new bucket
            createBucket = function (req, res) {
                var s3 = new AWS.S3(),
                    bucket = req.params.name,
                    params = {
                        Bucket: bucket
                    },
                    handleCreateBucket = function (err, data) {
                        if (err) {
                            res.status(500).send(err);
                        } else {
                            // Add s3g link to reference the resource
                            data.links = [{
                                rel: 'self',
                                href: getOriginalink(req, bucket)
                            }];

                            res.json(data);
                        }
                    };

                s3.createBucket(params, handleCreateBucket);
            },
            // Delete a bucket
            deleteBucket = function (req, res) {
                var s3 = new AWS.S3(),
                    params = {
                        Bucket: req.params.name
                    },
                    handleDeleteBucket = function (err, data) {
                        if (err) {
                            res.status(500).send(err);
                        } else {
                            res.json(data);
                        }
                    };

                s3.deleteBucket(params, handleDeleteBucket);
            },
            // Get an object key from the bucket
            getObjectInBucket = function (req, res) {
                var s3 = new AWS.S3(),
                    bucket = req.params.name,
                    key = getFullKeyParam(req.params, req.route),
                    params = {
                        Bucket: bucket,
                        Key: key
                    },
                    handleError = function (err) {
                        res.status(500).send(err);
                    };

                s3.getObject(params).createReadStream().on('error', handleError).pipe(res);

            },
            // Upload a file to the bucket
            createObjectInBucket = function (req, res) {
                var s3 = new AWS.S3(),
                    bucket = req.params.name,
                    key = getFullKeyParam(req.params, req.route),
                    params = {
                        Bucket: bucket,
                        Key: key,
                        // Pipe the file through the request body
                        Body: req
                    },
                    trackUploadProgress = function (evt) {
                        // This function is called each time a chunk of the file is uploaded
                        //console.log(evt);
                    },
                    handleUploadComplete = function (err, data) {
                        if (err) {
                            res.status(500).send(err);
                        } else {
                            // Add s3g link to reference the resource                            
                            data.links = [{
                                rel: 'self',
                                href: getOriginalink(req)
                            }];
                            
                            res.json(data);
                        }
                    };

                s3.upload(params).on('httpUploadProgress', trackUploadProgress).send(handleUploadComplete);
            },
            // Delete objects from a bucket
            deleteObjectsInBucket = function (req, res) {
                var s3 = new AWS.S3(),
                    bucket = req.params.name,
                    key = getFullKeyParam(req.params, req.route),
                    params = {
                        Bucket: bucket,
                        Delete: {
                            Objects: [{
                                Key: key
                            }]
                        }
                    },
                    
                    handleDeleteObjects = function (err, data) {
                        if (err) {
                            res.status(500).send(err);
                        } else {
                            res.json(data);
                        }
                    };
                s3.deleteObjects(params, handleDeleteObjects);
            };

        // If there are config options specified update the config with them
        if (config) {
            AWS.config.update(config);
        }
        
        // Routes
        // Get all buckets on root url
        router.get('/', listBuckets);

        // Bucket CRUD
        // Get a bucket by name
        router.get('/:name', getBucket);
        router.get('/:name/', getBucket);
        // Create a bucket by name
        router.put('/:name', createBucket);
        router.put('/:name/', createBucket);
        // Delete a bucket by name
        router.delete('/:name', deleteBucket);
        router.delete('/:name/', deleteBucket);
        
        // Object CRUD
        // Get an object(key) from bucket(name)
        router.get('/:name/:key*', getObjectInBucket);
        router.get('/:name/:key/', getObjectInBucket);
        // Create an object(key) from bucket(name)
        router.put('/:name/:key*', createObjectInBucket);
        router.put('/:name/:key/', createObjectInBucket);
        // Delete an object(key) from bucket(name)
        router.delete('/:name/:key*', deleteObjectsInBucket);
        router.delete('/:name/:key/', deleteObjectsInBucket);
        
        return router;
    };
}());