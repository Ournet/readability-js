'use strict';

var cheerio = require('cheerio');
var request = require('request');
var helpers = require('./helpers');
var encodinglib = require('encoding');
var urllib = require('url');

exports.debug = function(debug) {
	helpers.debug(debug);
};

exports.debug(false);

function findHTMLCharset(htmlbuffer) {

	var body = htmlbuffer.toString('ascii'),
		input, meta, charset;

	meta = body.match(/<meta\s+http-equiv=["']content-type["'][^>]*?>/i);
	if (meta) {
		input = meta[0];
	}

	if (input) {
		charset = input.match(/charset\s?=\s?([a-zA-Z\-0-9]*);?/);
		if (charset) {
			charset = (charset[1] || '').trim().toLowerCase();
		}
	}
	if (!charset) {
		meta = body.match(/<meta\s+charset=["'](.*?)["']/i);
		if (meta) {
			charset = (meta[1] || '').trim().toLowerCase();
		}
	}

	return charset;
}

function parseContentType(str) {
	if (!str) {
		return {};
	}
	var parts = str.split(';'),
		mimeType = parts.shift(),
		charset, chparts;

	for (var i = 0, len = parts.length; i < len; i++) {
		chparts = parts[i].split('=');
		if (chparts.length > 1) {
			if (chparts[0].trim().toLowerCase() === 'charset') {
				charset = chparts[1];
			}
		}
	}

	return {
		mimeType: (mimeType || '').trim().toLowerCase(),
		charset: (charset || 'UTF-8').trim().toLowerCase() // defaults to UTF-8
	};
}

function readPage($, callback) {
	var date = Date.now(),
		content, title;
	try {
		content = helpers.grabArticle($);
		title = helpers.grabTitle($);
	} catch (e) {
		return callback(e);
	}
	// console.log('title', title);
	// console.log('grabArticle', Date.now() - date);
	content = content ? content : false;
	var result = {
		title: title,
		content: content,
		document: $
	};
	callback(null, result);
}

function readHtml(html, callback) {
	if (typeof html !== 'string') {
		html = html.toString();
	}
	var page;
	try {
		page = cheerio.load(html);
	} catch (e) {
		return callback(e);
	}
	readPage(page, callback);
}

function readUrl(url, requestOptions, options, callback) {
	request(url, requestOptions, function(err, res, buffer) {
		if (err) {
			return callback(err);
		}

		var contentType = parseContentType(res.headers['content-type']);

		if (contentType.mimeType === 'text/html') {
			contentType.charset = findHTMLCharset(buffer) || contentType.charset;
		}

		contentType.charset = (options.overrideEncoding || contentType.charset || 'utf-8').trim().toLowerCase();

		if (!contentType.charset.match(/^utf-?8$/i)) {
			buffer = encodinglib.convert(buffer, 'UTF-8', contentType.charset);
		}

		buffer = buffer.toString();

		if (options.preprocess) {
			options.preprocess(buffer, res, contentType, function(preprocessErr, data) {
				if (preprocessErr) {
					return callback(preprocessErr);
				}
				callback(null, res, data);
			});
		} else {
			callback(null, res, buffer);
		}
	});
}

function read(html, options, callback) {
	if (typeof options === 'function') {
		callback = options;
		options = {};
	}

	var overrideEncoding = options.encoding,
		preprocess = options.preprocess;

	options.encoding = null;
	delete options.preprocess;

	// If is a cheerio object/function
	if (html && typeof html === 'function' && html.html && html.text) {
		return readPage(html, callback);
	}

	var parsedURL = urllib.parse(html);
	if (['http:', 'https:', 'unix:', 'ftp:', 'sftp:'].indexOf(parsedURL.protocol) === -1) {
		readHtml(html, callback);
	} else {
		readUrl(html, options, {
			preprocess: preprocess,
			overrideEncoding: overrideEncoding
		}, function(err, res, buffer) {
			if (err) {
				return callback(err);
			}
			readHtml(buffer, callback);
		});
	}
}

module.exports = read;
