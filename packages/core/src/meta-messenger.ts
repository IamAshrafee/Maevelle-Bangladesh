export interface MetaMessengerConfig {
  readonly appId: string;
  readonly appSecret: string;
  readonly graphApiVersion: string;
  readonly oauthCallbackUrl: string;
  readonly requestTimeoutMs: number;
}

export interface MetaPageCredential {
  readonly id: string;
  readonly name: string;
  readonly category: string | null;
  readonly accessToken: string;
  readonly tasks: readonly string[];
}

export interface MetaInstagramCredential {
  readonly id: string;
  readonly username: string | null;
  readonly name: string;
  readonly profilePictureUrl: string | null;
  readonly accountType: string | null;
  readonly pageId: string;
  readonly pageName: string;
  readonly pageAccessToken: string;
  readonly pageTasks: readonly string[];
}

export interface MetaConversationPage {
  readonly conversations: readonly {
    id: string;
    participants: readonly { id: string; name: string | null }[];
  }[];
  readonly nextCursor: string | null;
}

export interface MetaMessagePage {
  readonly messages: readonly {
    id: string;
    createdAt: string;
    fromId: string | null;
    text: string | null;
    attachments: readonly {
      id: string | null;
      mimeType: string | null;
      name: string | null;
      size: number | null;
    }[];
  }[];
  readonly nextCursor: string | null;
}

export class MetaGraphError extends Error {
  public constructor(
    public readonly category:
      | 'AUTHENTICATION'
      | 'PERMISSION'
      | 'RATE_LIMIT'
      | 'POLICY'
      | 'RECIPIENT'
      | 'VALIDATION'
      | 'TEMPORARY'
      | 'UNKNOWN_OUTCOME'
      | 'PROVIDER',
    public readonly code: string,
    message: string,
    public readonly retryAfter?: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'MetaGraphError';
  }
}

type Fetcher = typeof fetch;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MetaGraphError(
      'PROVIDER',
      'META_RESPONSE_INVALID',
      'Meta returned an invalid response.',
    );
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value)
    throw new MetaGraphError(
      'PROVIDER',
      'META_RESPONSE_INVALID',
      `Meta response omitted ${field}.`,
    );
  return value;
}

function classifyError(payload: unknown, status: number, retryAfter?: string): MetaGraphError {
  const root = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const rawError = (root as Record<string, unknown>).error;
  if (!rawError || typeof rawError !== 'object' || Array.isArray(rawError))
    return new MetaGraphError(
      status === 429 ? 'RATE_LIMIT' : status >= 500 ? 'TEMPORARY' : 'PROVIDER',
      `META_HTTP_${status}`,
      'Meta request failed.',
      retryAfter,
    );
  const error = rawError as Record<string, unknown>;
  const code = typeof error.code === 'number' ? error.code : 0;
  const subcode = typeof error.error_subcode === 'number' ? error.error_subcode : 0;
  const safeCode = `META_${code}${subcode ? `_${subcode}` : ''}`;
  const requestId = typeof error.fbtrace_id === 'string' ? error.fbtrace_id : undefined;
  const message =
    typeof error.message === 'string' ? error.message.slice(0, 300) : 'Meta request failed.';
  const category =
    code === 190
      ? 'AUTHENTICATION'
      : code === 10 || code === 200
        ? 'PERMISSION'
        : code === 4 || code === 17 || code === 32 || code === 613 || status === 429
          ? 'RATE_LIMIT'
          : code === 551 || subcode === 2018278
            ? 'RECIPIENT'
            : code === 100
              ? 'VALIDATION'
              : status >= 500
                ? 'TEMPORARY'
                : 'PROVIDER';
  return new MetaGraphError(category, safeCode, message, retryAfter, requestId);
}

export class MetaMessengerClient {
  public constructor(
    private readonly config: MetaMessengerConfig,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  public authorizationUrl(state: string, scopes: readonly string[]): string {
    const url = new URL(`https://www.facebook.com/${this.config.graphApiVersion}/dialog/oauth`);
    url.searchParams.set('client_id', this.config.appId);
    url.searchParams.set('redirect_uri', this.config.oauthCallbackUrl);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes.join(','));
    return url.toString();
  }

  public async exchangeCode(code: string): Promise<string> {
    const url = this.url('/oauth/access_token');
    const body = new URLSearchParams({
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      redirect_uri: this.config.oauthCallbackUrl,
      code,
    });
    return requiredText(
      object(
        await this.request(url, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body,
        }),
      ).access_token,
      'access_token',
    );
  }

  public async listPages(userToken: string): Promise<readonly MetaPageCredential[]> {
    const url = this.url('/me/accounts');
    url.searchParams.set('fields', 'id,name,category,access_token,tasks');
    url.searchParams.set('limit', '100');
    const response = object(await this.request(url, { headers: this.auth(userToken) }));
    if (!Array.isArray(response.data))
      throw new MetaGraphError(
        'PROVIDER',
        'META_RESPONSE_INVALID',
        'Meta response omitted Page data.',
      );
    return response.data.map((item) => {
      const page = object(item);
      return {
        id: requiredText(page.id, 'page.id'),
        name: requiredText(page.name, 'page.name'),
        category: typeof page.category === 'string' ? page.category : null,
        accessToken: requiredText(page.access_token, 'page.access_token'),
        tasks: Array.isArray(page.tasks)
          ? page.tasks.filter((task): task is string => typeof task === 'string')
          : [],
      };
    });
  }

  /** Discover only Instagram professional accounts proven by the authorized Page response. */
  public async listInstagramAccounts(
    userToken: string,
  ): Promise<readonly MetaInstagramCredential[]> {
    const url = this.url('/me/accounts');
    url.searchParams.set(
      'fields',
      'id,name,access_token,tasks,instagram_business_account{id,username,name,profile_picture_url,account_type}',
    );
    url.searchParams.set('limit', '100');
    const response = object(await this.request(url, { headers: this.auth(userToken) }));
    if (!Array.isArray(response.data))
      throw new MetaGraphError(
        'PROVIDER',
        'META_RESPONSE_INVALID',
        'Meta response omitted Page data.',
      );
    return response.data.flatMap((item) => {
      const page = object(item);
      if (!page.instagram_business_account) return [];
      const account = object(page.instagram_business_account);
      return [
        {
          id: requiredText(account.id, 'instagram_business_account.id'),
          username: typeof account.username === 'string' ? account.username : null,
          name:
            typeof account.name === 'string' && account.name
              ? account.name
              : typeof account.username === 'string' && account.username
                ? account.username
                : 'Instagram professional account',
          profilePictureUrl:
            typeof account.profile_picture_url === 'string' ? account.profile_picture_url : null,
          accountType: typeof account.account_type === 'string' ? account.account_type : null,
          pageId: requiredText(page.id, 'page.id'),
          pageName: requiredText(page.name, 'page.name'),
          pageAccessToken: requiredText(page.access_token, 'page.access_token'),
          pageTasks: Array.isArray(page.tasks)
            ? page.tasks.filter((task): task is string => typeof task === 'string')
            : [],
        },
      ];
    });
  }

  public async inspectPermissions(userToken: string): Promise<readonly string[]> {
    const url = this.url('/me/permissions');
    const response = object(await this.request(url, { headers: this.auth(userToken) }));
    return Array.isArray(response.data)
      ? response.data.flatMap((item) => {
          const permission = object(item);
          return permission.status === 'granted' && typeof permission.permission === 'string'
            ? [permission.permission]
            : [];
        })
      : [];
  }

  public async subscribePage(
    pageId: string,
    pageToken: string,
    fields: readonly string[],
  ): Promise<void> {
    const url = this.url(`/${encodeURIComponent(pageId)}/subscribed_apps`);
    url.searchParams.set('subscribed_fields', fields.join(','));
    await this.request(url, { method: 'POST', headers: this.auth(pageToken) });
  }

  public async unsubscribePage(pageId: string, pageToken: string): Promise<void> {
    await this.request(this.url(`/${encodeURIComponent(pageId)}/subscribed_apps`), {
      method: 'DELETE',
      headers: this.auth(pageToken),
    });
  }

  public async inspectPageSubscription(
    pageId: string,
    pageToken: string,
  ): Promise<{ subscribed: boolean; fields: readonly string[] }> {
    const url = this.url(`/${encodeURIComponent(pageId)}/subscribed_apps`);
    const response = object(await this.request(url, { headers: this.auth(pageToken) }));
    if (!Array.isArray(response.data))
      throw new MetaGraphError(
        'PROVIDER',
        'META_RESPONSE_INVALID',
        'Meta response omitted subscription data.',
      );
    const ownSubscription = response.data
      .map((item) => object(item))
      .find((item) => item.id === this.config.appId);
    return {
      subscribed: Boolean(ownSubscription),
      fields: Array.isArray(ownSubscription?.subscribed_fields)
        ? ownSubscription.subscribed_fields.filter(
            (field): field is string => typeof field === 'string',
          )
        : [],
    };
  }

  public async verifyPage(
    pageId: string,
    pageToken: string,
  ): Promise<{ id: string; name: string }> {
    const url = this.url(`/${encodeURIComponent(pageId)}`);
    url.searchParams.set('fields', 'id,name');
    const response = object(await this.request(url, { headers: this.auth(pageToken) }));
    return { id: requiredText(response.id, 'id'), name: requiredText(response.name, 'name') };
  }

  public async verifyInstagramAccount(
    instagramAccountId: string,
    pageToken: string,
  ): Promise<{
    id: string;
    username: string | null;
    name: string | null;
    accountType: string | null;
  }> {
    const url = this.url(`/${encodeURIComponent(instagramAccountId)}`);
    url.searchParams.set('fields', 'id,username,name,account_type');
    const response = object(await this.request(url, { headers: this.auth(pageToken) }));
    return {
      id: requiredText(response.id, 'id'),
      username: typeof response.username === 'string' ? response.username : null,
      name: typeof response.name === 'string' ? response.name : null,
      accountType: typeof response.account_type === 'string' ? response.account_type : null,
    };
  }

  public async subscribeInstagramAccount(
    instagramAccountId: string,
    pageToken: string,
    fields: readonly string[],
  ): Promise<void> {
    const url = this.url(`/${encodeURIComponent(instagramAccountId)}/subscribed_apps`);
    url.searchParams.set('subscribed_fields', fields.join(','));
    await this.request(url, { method: 'POST', headers: this.auth(pageToken) });
  }

  public async unsubscribeInstagramAccount(
    instagramAccountId: string,
    pageToken: string,
  ): Promise<void> {
    await this.request(this.url(`/${encodeURIComponent(instagramAccountId)}/subscribed_apps`), {
      method: 'DELETE',
      headers: this.auth(pageToken),
    });
  }

  public async inspectInstagramSubscription(
    instagramAccountId: string,
    pageToken: string,
  ): Promise<{ subscribed: boolean; fields: readonly string[] }> {
    const response = object(
      await this.request(this.url(`/${encodeURIComponent(instagramAccountId)}/subscribed_apps`), {
        headers: this.auth(pageToken),
      }),
    );
    const data = Array.isArray(response.data) ? response.data.map(object) : [];
    const ownSubscription = data.find((item) => item.id === this.config.appId);
    return {
      subscribed: Boolean(ownSubscription),
      fields: Array.isArray(ownSubscription?.subscribed_fields)
        ? ownSubscription.subscribed_fields.filter(
            (field): field is string => typeof field === 'string',
          )
        : [],
    };
  }

  public async listInstagramConversations(
    instagramAccountId: string,
    pageToken: string,
    after?: string,
  ): Promise<MetaConversationPage> {
    const url = this.url(`/${encodeURIComponent(instagramAccountId)}/conversations`);
    url.searchParams.set('platform', 'instagram');
    url.searchParams.set('fields', 'id,participants');
    // One conversation per durable checkpoint prevents a crash from skipping
    // the remainder of a provider page after partially importing messages.
    url.searchParams.set('limit', '1');
    if (after) url.searchParams.set('after', after);
    const response = object(await this.request(url, { headers: this.auth(pageToken) }));
    const data = Array.isArray(response.data) ? response.data : [];
    const paging = object(response.paging ?? {});
    const cursors = object(paging.cursors ?? {});
    return {
      conversations: data.map((item) => {
        const conversation = object(item);
        const participants = object(conversation.participants ?? {});
        return {
          id: requiredText(conversation.id, 'conversation.id'),
          participants: Array.isArray(participants.data)
            ? participants.data.map((participant) => {
                const value = object(participant);
                return {
                  id: requiredText(value.id, 'participant.id'),
                  name: typeof value.name === 'string' ? value.name : null,
                };
              })
            : [],
        };
      }),
      nextCursor: typeof cursors.after === 'string' ? cursors.after : null,
    };
  }

  public async listConversations(
    pageId: string,
    pageToken: string,
    after?: string,
  ): Promise<MetaConversationPage> {
    const url = this.url(`/${encodeURIComponent(pageId)}/conversations`);
    url.searchParams.set('platform', 'messenger');
    url.searchParams.set('fields', 'id,participants');
    url.searchParams.set('limit', '1');
    if (after) url.searchParams.set('after', after);
    const response = object(await this.request(url, { headers: this.auth(pageToken) }));
    const data = Array.isArray(response.data) ? response.data : [];
    const paging = object(response.paging ?? {});
    const cursors = object(paging.cursors ?? {});
    return {
      conversations: data.map((item) => {
        const conversation = object(item);
        const participantsContainer = object(conversation.participants ?? {});
        const participants = Array.isArray(participantsContainer.data)
          ? participantsContainer.data
          : [];
        return {
          id: requiredText(conversation.id, 'conversation.id'),
          participants: participants.map((participant) => {
            const value = object(participant);
            return {
              id: requiredText(value.id, 'participant.id'),
              name: typeof value.name === 'string' ? value.name : null,
            };
          }),
        };
      }),
      nextCursor: typeof cursors.after === 'string' ? cursors.after : null,
    };
  }

  public async listConversationMessages(
    conversationId: string,
    pageToken: string,
    after?: string,
  ): Promise<MetaMessagePage> {
    const url = this.url(`/${encodeURIComponent(conversationId)}/messages`);
    url.searchParams.set('fields', 'id,created_time,from,message,attachments');
    url.searchParams.set('limit', '50');
    if (after) url.searchParams.set('after', after);
    const response = object(await this.request(url, { headers: this.auth(pageToken) }));
    const data = Array.isArray(response.data) ? response.data : [];
    const paging = object(response.paging ?? {});
    const cursors = object(paging.cursors ?? {});
    return {
      messages: data.map((item) => {
        const message = object(item);
        const from = object(message.from ?? {});
        const attachmentContainer = object(message.attachments ?? {});
        const attachments = Array.isArray(attachmentContainer.data) ? attachmentContainer.data : [];
        return {
          id: requiredText(message.id, 'message.id'),
          createdAt: requiredText(message.created_time, 'message.created_time'),
          fromId: typeof from.id === 'string' ? from.id : null,
          text: typeof message.message === 'string' && message.message ? message.message : null,
          attachments: attachments.map((item) => {
            const attachment = object(item);
            return {
              id: typeof attachment.id === 'string' ? attachment.id : null,
              mimeType: typeof attachment.mime_type === 'string' ? attachment.mime_type : null,
              name: typeof attachment.name === 'string' ? attachment.name : null,
              size: typeof attachment.size === 'number' ? attachment.size : null,
            };
          }),
        };
      }),
      nextCursor: typeof cursors.after === 'string' ? cursors.after : null,
    };
  }

  public async sendText(pageId: string, recipientId: string, message: string, pageToken: string) {
    return this.send(pageId, pageToken, {
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { text: message },
    });
  }

  public async sendInstagramText(
    instagramAccountId: string,
    recipientId: string,
    message: string,
    pageToken: string,
  ) {
    return this.send(instagramAccountId, pageToken, {
      recipient: { id: recipientId },
      message: { text: message },
    });
  }

  public async sendInstagramImage(
    instagramAccountId: string,
    recipientId: string,
    imageUrl: string,
    pageToken: string,
  ) {
    return this.send(instagramAccountId, pageToken, {
      recipient: { id: recipientId },
      message: { attachment: { type: 'image', payload: { url: imageUrl } } },
    });
  }

  public async sendAttachment(
    pageId: string,
    recipientId: string,
    attachmentId: string,
    pageToken: string,
  ) {
    return this.send(pageId, pageToken, {
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { attachment: { type: 'image', payload: { attachment_id: attachmentId } } },
    });
  }

  public async uploadImage(
    pageId: string,
    content: Buffer,
    mimeType: string,
    pageToken: string,
  ): Promise<string> {
    const form = new FormData();
    form.set(
      'message',
      JSON.stringify({ attachment: { type: 'image', payload: { is_reusable: true } } }),
    );
    form.set('filedata', new Blob([content], { type: mimeType }), 'image');
    const response = object(
      await this.request(this.url(`/${encodeURIComponent(pageId)}/message_attachments`), {
        method: 'POST',
        headers: this.auth(pageToken),
        body: form,
      }),
    );
    return requiredText(response.attachment_id, 'attachment_id');
  }

  private async send(pageId: string, pageToken: string, body: unknown) {
    const response = object(
      await this.request(this.url(`/${encodeURIComponent(pageId)}/messages`), {
        method: 'POST',
        headers: { ...this.auth(pageToken), 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    return {
      recipientId: requiredText(response.recipient_id, 'recipient_id'),
      messageId: requiredText(response.message_id, 'message_id'),
    };
  }

  private url(path: string): URL {
    return new URL(`https://graph.facebook.com/${this.config.graphApiVersion}${path}`);
  }
  private auth(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }

  private async request(url: URL, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    let response: Response;
    try {
      response = await this.fetcher(url, { ...init, signal: controller.signal });
    } catch (error) {
      throw new MetaGraphError(
        'UNKNOWN_OUTCOME',
        error instanceof DOMException && error.name === 'AbortError'
          ? 'META_TIMEOUT'
          : 'META_NETWORK_ERROR',
        'Meta request outcome is unknown.',
      );
    } finally {
      clearTimeout(timeout);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok)
      throw classifyError(
        payload,
        response.status,
        response.headers.get('retry-after') ?? undefined,
      );
    return payload;
  }
}
