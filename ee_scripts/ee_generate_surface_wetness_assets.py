#!/usr/bin/env python2

""" This script pulls from the Landsat 8 satellite to generate an estimate of
recent surface wetness """

import ee
import json
import time

_SLEEP_TIME_SECONDS = 60 # Usually takes about 9 minutes to generate this asset

def now_minus_n_months(*args):
    """ accept a single positional argument (month) specifying how far from now
    to go back in our landsat imagery"""
    now = ee.datetime.datetime.now()
    dst_year = now.year
    dst_month = now.month - args[0]
    dst_day = now.day
    if dst_month < 0:
        dst_year = dst_year - 1
        dst_month = dst_month + 12
    return str(dst_year) + '-' + str(dst_month) + '-' + str(dst_day)

def qa(pimage):
  """ a function to mask out unwanted pixels using 5471 as a bitwise mask
  because it's binary equivalent is the inverse of what we want in the qa
  band info gleaned from https://landsat.usgs.gov/collectionqualityband """
  image = pimage.select('BQA').bitwiseAnd(5471).neq(0).eq(0)
  return pimage.updateMask(image);

def addQualityBands(image):
   """ a function to add the time stamp bands """
   return image.addBands(image.metadata('system:time_start'))

def image_from_ls8_collection(collection_id='LANDSAT/LC08/C01/T1_RT', cloud_mask=5):
    """The image collection and sorting that all out. Get the most recent image from a given collection"""
    collection = ee.ImageCollection(collection_id). \
        filterMetadata('CLOUD_COVER', 'less_than', cloud_mask). \
        filterMetadata('CLOUD_COVER', 'greater_than', -0.1). \
        filterBounds(ee.FeatureCollection('ft:1fRY18cjsHzDgGiJiS2nnpUU3v9JPDc2HNaR7Xk8').filter(ee.Filter.eq('Name','Kansas')))
    # map the qa function over the collection to clean out snow, shadows, clouds
    collection_qa = collection.map(qa)
    # add a temporal band to the collection to sort by later
    collection_qa_withtime = collection_qa.map(addQualityBands)
    # build a mosiac from the resulting collection using the most recent pixel
    return collection_qa_withtime.qualityMosaic('system:time_start')

def get_datetime_qa_band(image):
    return image.select('system:time_start')

def water_ruiz2014(image):
    """ surface water detection from Ruiz et al. 2014 that just uses band 6
    and band 4 """
    band_magic = {
        'B4': image.select('B4'),
        'B6': image.select('B6'),
        'blank': ee.Image(0)
    }
    return band_magic['blank'].where(band_magic['B6'].lte(band_magic['B4']), 1)

def water_mcfeeters1996(plandsatimage):
  """the normalized difference water index method (green - nir)/(green + nir)"""
  b3 = plandsatimage.select('B3');
  b5 = plandsatimage.select('B5');
  ndwi = b3.subtract(b5).divide((b3.add(b5)));
  blank = ee.Image(0);
  out = blank.where(ndwi.gte(0),1);
  return out.updateMask(out);

def water_xu2007(plandsatimage):
  """ the modified normalized difference water index method
  (green - swir)/(green + swir)"""
  b3 = plandsatimage.select('B3');
  b6 = plandsatimage.select('B6');
  mndwi = b3.subtract(b6).divide((b3.add(b6)));
  blank = ee.Image(0);
  out = blank.where(mndwi.gte(0),1);
  return out.updateMask(out);

def get_fc_coordinates(collection=None):
    return collection.geometry().getInfo()['coordinates']

def set_asset_globally_readable(assetId=None):
   acl = ee.data.getAssetAcl(assetId)
   acl['all_users_can_read'] = True
   acl.pop('owners')
   ee.data.setAssetAcl(assetId, json.dumps(acl))

def exportImageToAsset(image=None, assetId=None, region=None, timeout_minutes=30):
    task = ee.batch.Export.image.toAsset(
        image=image,
        assetId=assetId,
        scale=10,
        maxPixels=40000000000,
        region=region,
        description='Generating LS8 last wet scene product'
    )
    # delete the asset if it exists
    try:
      ee.batch.data.deleteAsset(assetId)
    except ee.ee_exception.EEException:
      pass
    # start the task and monitor our progress
    task.start()
    # give ourselves a healthy amount of burn-in for a valid start_timestamp
    time.sleep(_SLEEP_TIME_SECONDS)
    try:
      task_start_time = int(task.status()['start_timestamp_ms'])
    except Exception as e:
      print("Task initiation failed completely -- perhaps we have this task duplicated on the server-side")
      raise(e)
    while str(task.status()['state']) != 'COMPLETED':
      time.sleep(_SLEEP_TIME_SECONDS)
      task_runtime = (int(task.status()['update_timestamp_ms']) - task_start_time ) / 1000
      # if we take longer than 30 minutes, throw an error
      if task_runtime > (60 * timeout_minutes):
        raise Exception('EE task timed out')
      if task.status()['state'] == 'FAILED':
        raise Exception('EE task FAILED')
    # if we succeeded, let's set the asset to globally readable
    time.sleep(3)
    set_asset_globally_readable(assetId)
    # return the task to the user for inspection
    return (task)


def exportImageToDrive(image, assetId):
    task_config = {
        'description': 'Generating LS8 last wet scene product',
        'scale': 30,
        'maxPixels': 400000000
    }
    task = ee.batch.Export.image(image, assetId, task_config)
    task.start()
    return (task)


if __name__ == "__main__":

    # Use our App Engine service account's credentials.
    ee.Initialize()

    # import the geometry for Kansas
    kansas = ee.FeatureCollection('ft:1fRY18cjsHzDgGiJiS2nnpUU3v9JPDc2HNaR7Xk8').filter(ee.Filter.eq('Name','Kansas'))

    # define our time-series information
    last_wet_scene = water_ruiz2014(
        image_from_ls8_collection('LANDSAT/LC08/C01/T1_RT')
    )

    # mask out pixels that have never been wet over a 30 year period
    last_wet_scene = last_wet_scene.multiply(
        ee.Image("users/kyletaylor/shared/long_run_surface_wetness_mask")
    )
    datetime = get_datetime_qa_band(
        image_from_ls8_collection('LANDSAT/LC08/C01/T1_RT')
    )
    # export the resulting surface wetness band
    status = exportImageToAsset(
        last_wet_scene,
        'users/kyletaylor/shared/LC8dynamicwater',
        region=get_fc_coordinates(kansas)
    )

    # add add the
    status = exportImageToAsset(
        datetime,
        'users/kyletaylor/shared/LC8dynamicwater_datetime',
        region=get_fc_coordinates(kansas)
    )