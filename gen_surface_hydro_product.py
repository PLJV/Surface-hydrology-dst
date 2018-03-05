""" This script pulls from the Landsat 8 satellite to generate an estimate of recent surface wetness """

import ee

def unixmillisecs_frommonths(pmonths):
  ''' mucking about with dates and times, the date range is the last 4 months'''
  return pmonths*1000*60*60*24*30


def imagefromcollection(pcollection):
  '''The image collection and sorting that all out. Get the most recent image from a given collection'''
  collection = ee.ImageCollection(pcollection).filterDate(eethen, eenow).filterMetadata('CLOUD_COVER', 'less_than', .3);
  recent = collection.sort('system:time_start', false).limit(1);
  print(recent);
  return collection.mosaic();

def water(plandsatimage):
  //extract band4 from image and assign that to variable b4
  var b4 = plandsatimage.select('B4');
  //extract band6 from image and assign that to variable b6
  var b6 = plandsatimage.select('B6');
  var blank = ee.Image(0);
  var output = blank.where(b6.lte(b4),1);
  return output.updateMask(output);

# MAIN

# define our time-series information
  
eenow = ee.Date(Date.now());
eethen = ee.Date(Date.now() - unixmillisecs_frommonths(10));

# import the geometry for Kansas
kansas = ee.FeatureCollection('ft:1fRY18cjsHzDgGiJiS2nnpUU3v9JPDc2HNaR7Xk8').
  filter(ee.Filter.eq('Name', 'Kansas'));

# copy over our water surface as an asset, caching the previous version so that 
# users that are currently on the website will be able to view the last copy
# if they are literally browsing while we are updating the assets
try:
  ee.data.deleteAsset('users/adaniels/shared/LC8dynamicwater_cached');
except Exception as e:
  pass
  
ee.data.copyAsset('users/adaniels/shared/LC8dynamicwater','users/adaniels/shared/LC8dynamicwater_cached');
ee.data.deleteAsset('users/adaniels/shared/LC8dynamicwater');
ee.data.createAsset({
  image: water(imagefromcollection('LANDSAT/LC08/C01/T1')).clipToCollection(kansas),
  description: 'dynamicwater_last4months',
  assetId: 'LC8dynamicwater',
  scale: 30,
  region: kansas,
  pyramidingPolicy: {'.default': 'sample'},
  maxPixels: 400000000,
  });
  
try: 
  ee.data.deleteAsset('users/adaniels/shared/LC8dynamicwater_cached');
except Exception as e:
  pass

