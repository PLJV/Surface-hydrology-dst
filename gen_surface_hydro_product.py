""" This script pulls from the Landsat 8 satellite to generate an estimate of 
recent surface wetness """

import config
import ee

def now_minus_n_months(*args):
  """ accept a single positional argument (month) specifying how far from now
  to go back in our landsat imagery"""
  try:
    now = ee.datetime.datetime.now()
    dst_year  = now.year
    dst_month = now.month - args[0]
    dst_day   = now.day
    if dst_month < 0:
      dst_year = dst_year - 1
      dst_month = dst_month + 12 
    return(ee.datetime.datetime(dst_year, dst_month, dst_day))  
  except Exception as e:
    raise e

def imagefromcollection(pcollection, eethen, eenow):
  '''The image collection and sorting that all out. Get the most recent image from a given collection'''
  collection = ee.ImageCollection(pcollection)
  collection = collection.filterDate(eethen)
  collection = collection.filterMetadata('CLOUD_COVER', 'less_than', .3)
  recent = collection.sort('system:time_start', False).limit(1)
  return collection.mosaic()

def water(plandsatimage):
  # extract band4 from image and assign that to variable b4
  b4 = plandsatimage.select('B4');
  # extract band6 from image and assign that to variable b6
  b6 = plandsatimage.select('B6');
  blank = ee.Image(0);
  output = blank.where(b6.lte(b4),1);
  return output.updateMask(output);

def exportImageToAsset(image, assetId, region):
    task_config = {
      'description':'dynamic water over the last 10 months',
      'scale':30,  
      'region':region,
      'maxPixels':400000000
    }
    task = ee.batch.Export.image(image, assetId, task_config)
    task.start()
      
# MAIN

# Use our App Engine service account's credentials.
EE_CREDENTIALS = ee.ServiceAccountCredentials(
    config.EE_ACCOUNT, config.EE_PRIVATE_KEY_FILE)
    
ee.Initialize(EE_CREDENTIALS)

# define our time-series information
  
eenow = ee.datetime.datetime.now();
eethen = now_minus_n_months(10);

# import the geometry for Kansas
kansas = ee.FeatureCollection('ft:1fRY18cjsHzDgGiJiS2nnpUU3v9JPDc2HNaR7Xk8').filter(ee.Filter.eq('Name', 'Kansas'));


# copy over our water surface as an asset, caching the previous version so that 
# users that are currently on the website will be able to view the last copy
# if they are literally browsing while we are updating the assets
try:
  ee.data.deleteAsset('LC8dynamicwater_cached')
except Exception as e:
  pass

value = water(imagefromcollection('LANDSAT/LC08/C01/T1', eethen, eenow)).clipToCollection(kansas)

exportImageToAsset(value, 'LC8dynamicwater', kansas)  


try: 
  ee.data.deleteAsset('users/adaniels/shared/LC8dynamicwater_cached');
except Exception as e:
  pass

