#!/usr/bin/env python
"""Web server for the Trendy Lights application.

The overall architecture looks like:

               server.py         script.js
 ______       ____________       _________
|      |     |            |     |         |
|  EE  | <-> | App Engine | <-> | Browser |
|______|     |____________|     |_________|
     \                               /
      '- - - - - - - - - - - - - - -'

The code in this file runs on App Engine. It's called when the user loads the
web page and when details about a polygon are requested.

Our App Engine code does most of the communication with EE. It uses the
EE Python library and the service account specified in config.py. The
exception is that when the browser loads map tiles it talks directly with EE.

The basic flows are:

1. Initial page load

When the user first loads the application in their browser, their request is
routed to the get() function in the MainHandler class by the framework we're
using, webapp2.

The get() function sends back the main web page (from index.html) along
with information the browser needs to render an Earth Engine map and
the IDs of the polygons to show on the map. This information is injected
into the index.html template through a templating engine called Jinja2,
which puts information from the Python context into the HTML for the user's
browser to receive.

Note: The polygon IDs are determined by looking at the static/polygons
folder. To add support for another polygon, just add another GeoJSON file to
that folder.

2. Getting details about a polygon

When the user clicks on a polygon, our JavaScript code (in static/script.js)
running in their browser sends a request to our backend. webapp2 routes this
request to the get() method in the DetailsHandler.

This method checks to see if the details for this polygon are cached. If
yes, it returns them right away. If no, we generate a Wikipedia URL and use
Earth Engine to compute the brightness trend for the region. We then store
these results in a cache and return the result.

Note: The brightness trend is a list of points for the chart drawn by the
Google Visualization API in a time series e.g. [[x1, y1], [x2, y2], ...].

Note: memcache, the cache we are using, is a service provided by App Engine
that temporarily stores small values in memory. Using it allows us to avoid
needlessly requesting the same data from Earth Engine over and over again,
which in turn helps us avoid exceeding our quota and respond to user
requests more quickly.

"""
import os
import lzstring
import json
import math

import config
import ee
import jinja2
import webapp2

from google.appengine.api import memcache

###############################################################################
#                             Web request handlers.                           #
###############################################################################


class MainHandler(webapp2.RequestHandler):
  """A servlet to handle requests to load the main Trendy Lights web page."""

  def get(self, path=''):
    """Returns the main web page, populated with EE map and polygon info."""
    historicalMapId = GetTrendyMapId(HISTORICAL_IMAGE_COLLECTION_ID)
    mostRecentMapId = GetTrendyMapId(MOST_RECENT_IMAGE_COLLECTION_ID, options = {
        'min': '0',
        'max': '1',
        'palette' : 'edf8b1, 081d58',
        'opacity' : '0.95',
    })

    template_values = {
        'historicalEeMapId': historicalMapId['mapid'],
        'mostRecentEeMapId': mostRecentMapId['mapid'],
        'historicalEeToken': historicalMapId['token'],
        'mostRecentEeToken': mostRecentMapId['token']
    }
    template = JINJA2_ENVIRONMENT.get_template('index.html')
    self.response.out.write(template.render(template_values))

class BackendFeatureCollectionHandler(webapp2.RequestHandler):
    """Accepts geojson input for feature collection passed by the user from the GUI that is then used to
     do things on the backend like extracting values and generating plots"""

    def __init__(self, request, response):
        self._ASSET = None
        self._ASSET_ID = None
        self._FEATURE_COLLECTION = None
        # initialize our super
        self.initialize(request, response)

    def unpack_zlib(self, *args):
        if args is None:
            fc = self._FEATURE_COLLECTION
        else:
            fc = args[0]
        # force json string formatting
        fc = json.dumps(fc)
        # decompress
        fc = lzstring.LZString().\
            decompressFromEncodedURIComponent(args[0])
        # unpack any lurking JS bug-a-boos
        fc = fc.encode("utf-8")
        fc = fc.replace('\'', '"')
        return fc

    def pack_zlib(self, *args):
        # force json string formatting
        json_str = json.dumps(args[0])
        # decompress
        json_str = lzstring.LZString().\
            compressToEncodedURIComponent(json_str)
        # unpack any lurking JS bug-a-boos
        json_str = json_str.encode("utf-8")
        return json_str

    def json_to_feature_collection(self, *args):
        if args is None:
            fc = self._FEATURE_COLLECTION
        else:
            fc = args[0]
        if type(fc) is not ee.FeatureCollection:
            # accept a string passed by client using the assetId=
            # signifier -- throw it at json.loads and see if it raises
            # any strange errors
            try:
                fc = json.loads(fc)
            except TypeError as e:
                fc = json.dumps(fc)
                fc = json.loads(fc)
            # listcomp as ee.Feature() and assign all features to a single FeatureCollection
            features = [ee.Feature(ft) for ft in fc['features']]
            fc = ee.FeatureCollection(features)
        return fc

    @property
    def feature_collection(self):
        return self._FEATURE_COLLECTION

    @feature_collection.setter
    def feature_collection(self, *args):
        # assign parameters for our extraction if provided
        fc = args[0] if args[0] else self._FEATURE_COLLECTION
        try:
            json.loads(fc)
            fc = self.json_to_feature_collection(fc)
        except ValueError as e:
            # if we couldn't make a dict out of the string, assume it's
            # it's a zlib-compressed string and unpack it
            fc = self.unpack_zlib(fc)
            fc = self.json_to_feature_collection(fc)
        self._FEATURE_COLLECTION = fc

    @property
    def asset(self):
        return self._ASSET

    @asset.setter
    def asset(self, *args):
        self._ASSET_ID = self.unpack_zlib(args[0]) if args[0] else self._ASSET_ID
        # load our asset by id
        self._ASSET = ee.Image(self._ASSET_ID)

    def extract(self):
        result = self._ASSET.reduceRegions(
          self.feature_collection, ee.Reducer.mean()).getInfo()
        extractions = [ft for ft in result['features']]
        return(extractions)

    def get(self):
        """default get handler for /extract?features=..."""
        # assign parameters for our extraction if provided
        self.asset = self.request.get('assetId')
        self.feature_collection = self.request.get('features')
        # process request
        values = self.extract()
        values = self.pack_zlib(values)
        # standard handlers for response
        self.response.headers['Content-Type'] = 'text'
        self.response.out.write(values)

# Define webapp2 routing from URL paths to web request handlers. See:
# http://webapp-improved.appspot.com/tutorials/quickstart.html
app = webapp2.WSGIApplication(routes=[
    (r'/', MainHandler),
    (r'/extract', BackendFeatureCollectionHandler)
], debug=False)


###############################################################################
#                                   Helpers.                                  #
###############################################################################


def GetTrendyMapId(image_collection_id, options=None):
  """Returns the MapID for the night-time lights trend map."""
  # if no pallet options were specified, assume some sane defaults
  if (options == None):
      options = {
        'min': '0.199',
        'max' : '1',
        'palette' : 'edf8b1, c7e9b4, 7fcdbb, 41b6c4, 1d91c0, 225ea8, 253494, 081d58',
        'opacity' : '0.95',
      }
  collection = ee.Image(image_collection_id);
  collection = collection.updateMask(collection.gte(0.199))

  return collection.getMapId(options)

###############################################################################
#                                   Constants.                                #
###############################################################################


# Memcache is used to avoid exceeding our EE quota. Entries in the cache expire
# 24 hours after they are added. See:
# https://cloud.google.com/appengine/docs/python/memcache/
MEMCACHE_EXPIRATION = 60 * 60 * 24

#IMAGE_COLLECTION_ID = 'NOAA/DMSP-OLS/NIGHTTIME_LIGHTS'
#IMAGE_COLLECTION_ID = 'users/kyletaylor/published/ks_ls5_wetness_1985_2012'
MOST_RECENT_IMAGE_COLLECTION_ID = 'users/kyletaylor/shared/LC8dynamicwater'
HISTORICAL_IMAGE_COLLECTION_ID = 'users/kyletaylor/shared/PLJVLC5historicwetness_10m'


###############################################################################
#                               Initialization.                               #
###############################################################################


# Use our App Engine service account's credentials.
EE_CREDENTIALS = ee.ServiceAccountCredentials(
    config.EE_ACCOUNT, config.EE_PRIVATE_KEY_FILE)

# Read the polygon IDs from the file system.
#POLYGON_IDS = [name.replace('.json', '') for name in os.listdir(POLYGON_PATH)]

# Create the Jinja templating system we use to dynamically generate HTML. See:
# http://jinja.pocoo.org/docs/dev/
JINJA2_ENVIRONMENT = jinja2.Environment(
    loader=jinja2.FileSystemLoader(os.path.dirname(__file__)),
    autoescape=True,
    extensions=['jinja2.ext.autoescape'])

# Initialize the EE API.
ee.Initialize(EE_CREDENTIALS)
