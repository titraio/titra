import { parse as parseContentType } from 'content-type'
import getRawBody from 'raw-body'

/**
 * @file Portions of code re-used from the zeit/micro repository
 * @see https://github.com/zeit/micro/blob/master/lib/index.js
 * @license
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 ZEIT, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */


/**
 * Maps requests to buffered raw bodies so that
 * multiple calls to `json` work as expected
 * @type {WeakMap}
 */
const rawBodyMap = new WeakMap()

const parseJSON = (str) => {
  try {
    return JSON.parse(str)
  } catch (err) {
    throw new Error('Invalid JSON')
  }
}

export const getBuffer = (req, { limit = '1mb', encoding } = {}) => Promise.resolve().then(() => {
  const type = req.headers['content-type'] || 'text/plain'
  const length = req.headers['content-length']
  // eslint-disable-next-line no-undefined
  if (encoding === undefined) {
    encoding = parseContentType(type).parameters.charset
  }
  const body = rawBodyMap.get(req)
  if (body) {
    return body
  }
  return getRawBody(req, { limit, length, encoding })
    .then((buf) => {
      rawBodyMap.set(req, buf)
      return buf
    })
    .catch((e) => {
      throw new Error(e)
    })
})

export const getText = (req, { limit, encoding } = {}) => getBuffer(req, { limit, encoding })
  .then((body) => body.toString(encoding))

export const getJson = (req, opts) => getText(req, opts).then((body) => parseJSON(body))
