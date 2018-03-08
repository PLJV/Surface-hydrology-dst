""" This script pulls from the Landsat 8 satellite to generate an estimate of recent surface wetness """

import config
import ee


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


def image_from_ls8_collection(collection_id="LANDSAT/LC08/C01/T1", hist_date=None, cloud_mask=0.3):
    """The image collection and sorting that all out. Get the most recent image from a given collection"""
    return ee.ImageCollection(collection_id). \
        filterDate(hist_date, str(ee.datetime.datetime.now().date())). \
        filterMetadata('CLOUD_COVER', 'less_than', cloud_mask). \
        mosaic()


def simple_water_algorithm(image):
    band_magic = {
        'B4': image.select('B4'),
        'B6': image.select('B6'),
        'blank': ee.Image(0)
    }
    return band_magic['blank'].where(band_magic['B6'].lte(band_magic['B4']), 1)


def get_fc_coordinates(collection=None):
    return collection.geometry().getInfo()['coordinates']


def exportImageToAsset(image, assetId, region):
    task = ee.batch.Export.image.toAsset(
        image=image,
        assetId=assetId,
        scale=30,
        maxPixels=400000000,
        region=region,
        description='dynamic water over the last 10 months'
    )
    # start the task and then return status object to the user
    task.start()
    return (task)


def exportImageToDrive(image, assetId):
    task_config = {
        'description': 'dynamic water over the last 10 months',
        'scale': 30,
        'maxPixels': 400000000
    }
    task = ee.batch.Export.image(image, assetId, task_config)
    task.start()
    return (task)


if __name__ == "__main__":

    # Use our App Engine service account's credentials.
    EE_CREDENTIALS = ee.ServiceAccountCredentials(
        config.EE_ACCOUNT, config.EE_PRIVATE_KEY_FILE)

    ee.Initialize(EE_CREDENTIALS)

    # import the geometry for Kansas
    kansas = ee.FeatureCollection('ft:1fRY18cjsHzDgGiJiS2nnpUU3v9JPDc2HNaR7Xk8').filter(ee.Filter.eq('Name', 'Kansas'))

    # define our time-series information
    last_wet_scene = simple_water_algorithm(image_from_ls8_collection(hist_date=now_minus_n_months(10)))
    last_wet_scene = last_wet_scene.updateMask(last_wet_scene.neq(0))

    ee.batch.data.deleteAsset('users/kyletaylor/shared/LC8dynamicwater')

    # export the resulting "water
    status = exportImageToAsset(
        last_wet_scene,
        'users/kyletaylor/shared/LC8dynamicwater',
        region=get_fc_coordinates(kansas)
    )

