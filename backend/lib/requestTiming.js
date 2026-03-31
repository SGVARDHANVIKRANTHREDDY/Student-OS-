/**
 * Express middleware: captures high-resolution request timing and
 * attaches it to the response as X-Response-Time header.
 * Also exposes `req.startTime` (hrtime) for downstream middleware.
 */
export function requestTiming() {
  return (req, res, next) => {
    req.startTime = process.hrtime.bigint()
    const onFinish = () => {
      const durationNs = process.hrtime.bigint() - req.startTime
      const durationMs = Number(durationNs) / 1e6
      if (!res.headersSent) {
        res.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`)
      }
      res.removeListener('finish', onFinish)
    }
    res.on('finish', onFinish)
    next()
  }
}
