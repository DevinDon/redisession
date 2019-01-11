import { GetOption, SetOption } from 'cookies';
import RedisInstance, { Redis } from 'ioredis';
import Koa, { Middleware } from 'koa';
import { Options, Session } from './type';

/** Session middleware class. */
export class RediSession {

  /** Redis connection. */
  private redis: Redis;
  /** Cookie options on get. */
  private getCookieOptions: GetOption;
  /** Cookie options on set. */
  private setCookieOptions: SetOption;

  /**
   * Config your own session pool.
   * @param {Koa} koa Koa instance.
   * @param {Options} options Session options.
   */
  constructor(
    private koa: Koa,
    private options: Options
  ) {
    this.options = Object.assign(
      {},
      {
        domain: 'localhost',
        httpOnly: true,
        maxAge: 24 * 3600 * 1000,
        name: 'session.id',
        overwrite: true,
        redis: {},
        secert: ['default', 'secert', 'keys']
      } as Options,
      options
    );
    this.init();
  }

  /**
   * Init RediSession.
   */
  private async init() {
    this.getCookieOptions = { signed: true };
    this.setCookieOptions = {
      domain: this.options.domain,
      httpOnly: this.options.httpOnly,
      maxAge: this.options.maxAge as number * 1000,
      signed: true,
      overwrite: this.options.overwrite
    };
    this.koa.keys = this.options.secert as string[];
    this.redis = new RedisInstance(this.options.redis);
  }

  /**
   * RediSession middleware.
   * @param {Koa.Context} c Context.
   * @param {Promise<any>} next Next.
   * @returns {Promise<void>} void.
   */
  public async session(c: Koa.Context, next: () => Promise<any>): Promise<void> {
    /** Session id. */
    let id = c.cookies.get(this.options.name as string, this.getCookieOptions);
    // let address = c.
    if ((id && await this.refresh(id)) || await this.add({ id: id = this.generate() })) {
      // Client has own session id and refresh session max age successfully,
      // or generate a new session successfully.
      c.cookies.set(this.options.name as string, id, this.setCookieOptions);
      c.session = await this.get(id);
    } else { // If both failed, clear session id. Maybe redis server is down.
      c.cookies.set(this.options.name as string, undefined, { maxAge: 0 });
      c.session = { id: '' };
    }
    await next();
    // Update session object in redis.
    await this.add(c.session);
  }

  /**
   * Add or update a new session to pool.
   * @param {Session} session Session info.
   * @returns {Promise<boolean>} Successed refresh or not.
   */
  public async add(session: Session): Promise<boolean> {
    await this.redis.hmset(session.id, 'session', JSON.stringify(session));
    return this.refresh(session.id);
  }

  /**
   * Delete session by session id.
   * @param {string} id Session id.
   * @returns {number} Delete count.
   */
  public async delete(id: string): Promise<number> {
    return await this.redis.del(id);
  }

  /**
   * Destory this pool instance.
   * @returns {void} void.
   */
  public disconnect(): void {
    this.redis.disconnect();
  }

  /**
   * Generate a new session id with time.
   * @returns {string} New session id.
   */
  public generate(): string {
    return String(Date.now()) + String(Math.random()).slice(2, 7);
  }

  /**
   * Get session object.
   * @param {string} id Session id.
   * @returns {Promise<Session>} Session object. If no such session, return empty id.
   */
  public async get(id: string): Promise<Session> {
    try {
      return JSON.parse((await this.redis.hget(id, 'session')) as string);
    } catch (err) {
      return { id: '' };
    }
  }

  /**
   * Refresh exprise time, second.
   * @param {string} id Session id.
   * @returns {boolean} Set exprise successed or not.
   */
  public async refresh(id: string): Promise<boolean> {
    return Boolean(await this.redis.expire(id, this.options.maxAge || 3600));
  }

  /**
   * @returns {Middleware} Return this ware.
   */
  public get ware(): Middleware {
    return this.session.bind(this);
  }

}

export default RediSession;
