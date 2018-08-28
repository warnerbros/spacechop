import { Request, Response } from 'express';
import pathToRegex from 'path-to-regexp';
import { Readable } from 'stream';
import Sources from './sources';
import transform, { buildTransformation } from './transform';
import { Config } from './types/Config';
import { formatToMime } from './types/Format';

const asyncWrapper = (fn) => (req, res) => {
  Promise
    .resolve(fn(req, res))
    .catch(handleError(res));
};

const handleError = (res) => (error) => {
  console.error(error);
  res.status(500);
  res.end(error.message);
};

// Extract named parameters from request.
const extractParams = (params, values) => {
  return params.reduce((acc, param, i) => Object.assign(acc, {
    [param.name]: values[i],
  }), {});
};

const lookThroughSources = async (sources, params): Promise<Readable> => {
  for (const source of sources) {
    const name = Object.keys(source)[0];
    const props = source[name];

    // initialize source instance with config.
    const instance = new Sources[name](props);
    if (await instance.exists(params)) {
      return instance.stream(params);
    }
  }
  return null;
};
export const requestHandler = (config: Config, keys) => async (req: Request, res: Response) => {
  // Extract params from request (enables the use of dynamic named params (.*)).
  const params = extractParams(keys, req.params);

  // find the right preset steps to use
  const preset = config.presets[params.preset];

  if (!preset) {
    res.status(404);
    res.end('Could not find preset');
    return;
  }

  // look through sources to fetch original source stream
  const stream = await lookThroughSources(config.sources, params);

  if (!stream) {
    res.status(404);
    res.end('Could not find image');
    return;
  }

  // Only analyze image after pipeline
  const onlyAnalyze = 'analyze' in req.query;
  if (onlyAnalyze) {
    const { state } = await buildTransformation(stream, preset.steps);
    res.json(state);
  } else {
    const { stream: transformed, definition } = await transform(stream, preset.steps);

    // Send image data through the worker which passes through to response.
    res.set('Content-Type', formatToMime(definition.type));
    // Send image data through the worker which passes through to response.
    transformed.pipe(res);
  }
}

export default (config: Config, server) => {
  if (!config) {
    return;
  }
  // extract paths from config to listen in on.
  const { paths = ['/*'] } = config;

  // listen on all paths.
  paths.forEach((path) => {
    const keys = [];
    const pattern = pathToRegex(path, keys);
    const handler = requestHandler(config, keys)
    server.get(pattern, asyncWrapper(handler));
  });
};
