import { Request, Response } from 'express';
import pkg from '../../package.json';

export class VersionController {
  /** GET /version → 200 { name, version } (read from package.json at build time) */
  get = (_req: Request, res: Response): void => {
    res.status(200).json({ name: pkg.name, version: pkg.version });
  };
}
