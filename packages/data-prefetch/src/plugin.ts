import { Module } from '@module-federation/runtime';
import type {
  FederationRuntimePlugin,
  RemoteInfo,
} from '@module-federation/runtime/types';
import { ModuleInfo, getResourceUrl } from '@module-federation/sdk';

import { getSignalFromManifest } from './common/runtime-utils';
import { MFDataPrefetch } from './prefetch';
import logger from './logger';

type depsPreloadArg = Omit<PreloadRemoteArgs, 'depsRemote'>;

interface PreloadRemoteArgs {
  nameOrAlias: string;
  exposes?: Array<string>;
  resourceCategory?: 'all' | 'sync';
  share?: boolean;
  depsRemote?: boolean | Array<depsPreloadArg>;
  filter?: (assetUrl: string) => boolean;
  prefetchInterface?: boolean;
}

interface Loading {
  id: string;
  promise: Promise<
    Array<{
      value: any;
      functionId: string;
    }>
  >;
}
const loadingArray: Array<Loading> = [];
const strategy = 'loaded-first';
let sharedFlag = strategy;
// eslint-disable-next-line max-lines-per-function
export const prefetchPlugin = (): FederationRuntimePlugin => ({
  name: 'data-prefetch-runtime-plugin',
  initContainer(options) {
    const { remoteSnapshot, remoteInfo, id, origin } = options;
    const snapshot = remoteSnapshot as ModuleInfo;
    const { name } = remoteInfo;

    const prefetchOptions = {
      name,
      remote: remoteInfo,
      origin,
      remoteSnapshot: snapshot,
    };
    const signal = getSignalFromManifest(snapshot);
    if (!signal) {
      return options;
    }
    if (sharedFlag !== strategy) {
      throw new Error(
        `[Module Federation Data Prefetch]: If you want to use data prefetch, the shared strategy must be 'loaded-first'`,
      );
    }

    const instance =
      MFDataPrefetch.getInstance(name) || new MFDataPrefetch(prefetchOptions);

    let prefetchUrl;
    // @ts-expect-error
    if (snapshot.prefetchEntry) {
      // @ts-expect-error
      prefetchUrl = getResourceUrl(snapshot, snapshot.prefetchEntry as string);
    }

    const exist = loadingArray.find((loading) => loading.id === id);
    if (exist) {
      return options;
    }
    // @ts-ignore
    const promise = instance.loadEntry(prefetchUrl).then(async () => {
      const projectExports = instance!.getProjectExports();
      if (projectExports instanceof Promise) {
        await projectExports;
      }
      return Promise.resolve().then(() => {
        const exports = instance!.getExposeExports(id);
        logger.info(`1. Start Prefetch: ${id} - ${performance.now()}`);
        const result = Object.keys(exports).map((k) => {
          const value = instance!.prefetch({
            id,
            functionId: k,
          });
          const functionId = k;

          return {
            value,
            functionId,
          };
        });
        return result;
      });
    });

    loadingArray.push({
      id,
      promise,
    });
    return options;
  },

  async onLoad(options) {
    const { remote, id } = options;
    const { name } = remote;
    const promise = loadingArray.find((loading) => loading.id === id)?.promise;

    if (promise) {
      const prefetch = await promise;
      const prefetchValue = prefetch.map((result) => result.value);
      await Promise.all(prefetchValue);
      const instance = MFDataPrefetch.getInstance(name);

      prefetch.forEach((result: { value: any; functionId: string }) => {
        const { value, functionId } = result;
        instance!.memorize(id + functionId, value);
      });
    }
    return options;
  },

  handlePreloadModule(options) {
    const { remoteSnapshot, name, id, preloadConfig, origin, remote } = options;
    const snapshot = remoteSnapshot as ModuleInfo;

    const signal = getSignalFromManifest(snapshot);
    if (!signal) {
      return options;
    }

    const prefetchOptions = {
      name,
      origin,
      remote,
      remoteSnapshot: snapshot,
    };
    const instance =
      MFDataPrefetch.getInstance(name) || new MFDataPrefetch(prefetchOptions);

    let prefetchUrl;
    // @ts-expect-error
    if (snapshot.prefetchEntry) {
      // @ts-expect-error
      prefetchUrl = getResourceUrl(snapshot, snapshot.prefetchEntry);
    }

    if (!preloadConfig.prefetchInterface) {
      // @ts-ignore
      instance.loadEntry(prefetchUrl);
      return options;
    }

    const promise = instance.loadEntry(prefetchUrl).then(async () => {
      let module = origin.moduleCache.get(remote.name);
      const moduleOptions = {
        host: origin,
        remoteInfo: remote as RemoteInfo,
      };
      if (!module) {
        module = new Module(moduleOptions);
        origin.moduleCache.set(remote.name, module);
      }
      const idPart = id.split('/');
      let expose = idPart[idPart.length - 1];
      if (expose !== '.') {
        expose = `./${expose}`;
      }
      await module.get(id, expose, {}, remoteSnapshot);

      const projectExports = instance!.getProjectExports();
      if (projectExports instanceof Promise) {
        await projectExports;
      }
      const exports = instance!.getExposeExports(id);
      logger.info(
        `1. PreloadRemote Start Prefetch: ${id} - ${performance.now()}`,
      );
      const result = Object.keys(exports).map((k) => {
        const value = instance!.prefetch({
          id,
          functionId: k,
        });
        const functionId = k;

        return {
          value,
          functionId,
        };
      });
      return result;
    });

    loadingArray.push({
      id,
      promise,
    });
    return options;
  },

  beforeLoadShare(options) {
    const shareInfo = options.shareInfo;
    sharedFlag = shareInfo?.strategy || sharedFlag;
    return options;
  },
});

export default prefetchPlugin;