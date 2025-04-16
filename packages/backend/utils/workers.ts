import { Job, MetricsTime, Worker } from 'bullmq'
import { environment } from '../environment.js'
import { inboxWorker } from './queueProcessors/inbox.js'
import { prepareSendRemotePostWorker } from './queueProcessors/prepareSendRemotePost.js'
import { sendPostToInboxes } from './queueProcessors/sendPostToInboxes.js'
import { getRemoteActorIdProcessor } from './queueProcessors/getRemoteActorIdProcessor.js'
import { logger } from './logger.js'
import { processRemotePostView } from './queueProcessors/processRemotePostView.js'
import { processRemoteMedia } from './queueProcessors/remoteMediaProcessor.js'
import { processFirehose } from '../atproto/workers/processFirehoseWorker.js'
import { sendPushNotification } from './queueProcessors/sendPushNotification.js'
import { checkPushNotificationDelivery } from './queueProcessors/checkPushNotificationDelivery.js'
import { generateUserKeyPair } from './queueProcessors/generateUserKeyPair.js'

logger.info('started worker')
const workerInbox = new Worker('inbox', (job: Job) => inboxWorker(job), {
  connection: environment.bullmqConnection,
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK * 2
  },
  concurrency: environment.workers.low
})

const workerPrepareSendPost = new Worker('prepareSendPost', (job: Job) => prepareSendRemotePostWorker(job), {
  connection: environment.bullmqConnection,
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK * 2
  },
  concurrency: environment.workers.high,
  lockDuration: 60000
})

const workerSendPostChunk = new Worker('sendPostToInboxes', (job: Job) => sendPostToInboxes(job), {
  connection: environment.bullmqConnection,
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK * 2
  },
  concurrency: environment.workers.high,
  lockDuration: 120000
})

const workerDeletePost = new Worker('deletePostQueue', (job: Job) => sendPostToInboxes(job), {
  connection: environment.bullmqConnection,
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK * 2
  },
  concurrency: environment.workers.high,
  lockDuration: 120000
})

const workerGetUser = new Worker('getRemoteActorId', async (job: Job) => await getRemoteActorIdProcessor(job), {
  connection: environment.bullmqConnection,
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK * 2
  },
  concurrency: environment.workers.high,
  lockDuration: 120000
})

const workerProcessRemotePostView = new Worker(
  'processRemoteView',
  async (job: Job) => await processRemotePostView(job),
  {
    connection: environment.bullmqConnection,
    metrics: {
      maxDataPoints: MetricsTime.ONE_WEEK * 2
    },
    concurrency: environment.workers.low,
    lockDuration: 120000
  }
)

const workerProcessRemoteMediaData = new Worker(
  'processRemoteMediaData',
  async (job: Job) => await processRemoteMedia(job),
  {
    connection: environment.bullmqConnection,
    metrics: {
      maxDataPoints: MetricsTime.ONE_WEEK * 2
    },
    concurrency: environment.workers.low,
    lockDuration: 120000
  }
)

const workerProcessFirehose = environment.enableBsky
  ? new Worker('firehoseQueue', async (job: Job) => await processFirehose(job), {
      connection: environment.bullmqConnection,
      metrics: {
        maxDataPoints: MetricsTime.ONE_WEEK * 2
      },
      concurrency: environment.workers.high,
      // up to five minutes
      lockDuration: 300000
    })
  : null

const workerSendPushNotification = new Worker(
  'sendPushNotification',
  async (job: Job) => await sendPushNotification(job),
  {
    connection: environment.bullmqConnection,
    metrics: {
      maxDataPoints: MetricsTime.ONE_WEEK * 2
    },
    concurrency: environment.workers.medium
  }
)

const workerCheckPushNotificationDelivery = new Worker(
  'checkPushNotificationDelivery',
  async (job: Job) => await checkPushNotificationDelivery(job),
  {
    connection: environment.bullmqConnection,
    metrics: {
      maxDataPoints: MetricsTime.ONE_WEEK * 2
    },
    concurrency: environment.workers.medium
  }
)

const workerGenerateUserKeyPair = new Worker(
  'generateUserKeyPair',
  async (job: Job) => await generateUserKeyPair(job),
  {
    connection: environment.bullmqConnection,
    metrics: {
      maxDataPoints: MetricsTime.ONE_WEEK * 2
    },
    concurrency: 1 // this one is VERY cpu intensive
  }
)

const workers = [
  workerInbox,
  workerDeletePost,
  workerGetUser,
  workerPrepareSendPost,
  workerProcessRemotePostView,
  workerSendPostChunk,
  workerProcessRemotePostView,
  workerProcessRemoteMediaData,
  workerSendPushNotification,
  workerCheckPushNotificationDelivery,
  workerGenerateUserKeyPair
]
if (environment.enableBsky) {
  workers.push(workerProcessFirehose as Worker)
}

workers.forEach((worker) => {
  worker.on('error', (err) => {
    logger.warn({
      message: `worker ${worker.name} had error`,
      error: err
    })
  })
  worker.on('failed', (err) => {
    logger.warn({
      message: `worker ${worker.name} failed`,
      error: err
    })
  })
})

const workersToLogFail = [
  workerInbox,
  workerDeletePost,
  workerGetUser,
  workerPrepareSendPost,
  workerProcessRemotePostView,
  workerSendPostChunk,
  workerSendPushNotification,
  workerGenerateUserKeyPair
]

workersToLogFail.forEach((worker) =>
  worker.on('failed', (err) => {
    logger.warn({
      message: `worker ${worker.name} failed`,
      error: err
    })
  })
)

export {
  workerInbox,
  workerSendPostChunk,
  workerPrepareSendPost,
  workerGetUser,
  workerDeletePost,
  workerProcessRemotePostView,
  workerProcessRemoteMediaData,
  workerProcessFirehose,
  workerSendPushNotification,
  workerCheckPushNotificationDelivery,
  workerGenerateUserKeyPair
}
