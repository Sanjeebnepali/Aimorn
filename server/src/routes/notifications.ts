import { Router } from 'express';

import { requireUser } from '../middleware/requireUser.js';
import { db } from '../lib/db.js';
import { asyncHandler } from '../lib/asyncHandler.js';

/**
 * The in-app Notification History feed — src/app/notifications/index.tsx's
 * only data source. Merges this user's own PERSONAL rows with every
 * BROADCAST row (see schema.prisma's Notification model doc comment for
 * why broadcasts are one shared row, not fanned out per recipient) into
 * one list sorted newest-first. Deliberately a single GET that also
 * computes unreadCount, rather than a separate route for that — the caller
 * (the bell icon's badge on Home) needs the count on every screen, but
 * re-fetching the whole list just for a number would be wasteful; the list
 * screen and the badge share this one response shape instead.
 */
export const notificationsRouter = Router();

const PAGE_SIZE = 30;

notificationsRouter.get('/notifications', requireUser, asyncHandler(async (req, res) => {
  const userId = res.locals.userId as string;
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

  const [user, rows] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { notificationsViewedAt: true } }),
    db.notification.findMany({
      where: { OR: [{ scope: 'PERSONAL', userId }, { scope: 'BROADCAST' }] },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  ]);

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const viewedAt = user.notificationsViewedAt;

  // Unread count is a SEPARATE query (not just "items on this page past
  // viewedAt") so paging further back never undercounts — a user who
  // hasn't opened this screen in a while should see the TRUE total, not
  // just however many happened to land on page 1.
  const unreadCount = await db.notification.count({
    where: {
      OR: [{ scope: 'PERSONAL', userId }, { scope: 'BROADCAST' }],
      ...(viewedAt ? { createdAt: { gt: viewedAt } } : {}),
    },
  });

  res.json({
    items: page.map((n) => ({
      id: n.id,
      scope: n.scope,
      title: n.title,
      body: n.body,
      createdAt: n.createdAt,
      unread: !viewedAt || n.createdAt > viewedAt,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    unreadCount,
  });
}));

/** Marks every current notification as viewed — called once when the
 * in-app feed screen mounts (see notifications/index.tsx), not per-item:
 * see User.notificationsViewedAt's own schema doc comment for why this is
 * one timestamp comparison rather than per-row read tracking. */
notificationsRouter.post('/notifications/mark-viewed', requireUser, asyncHandler(async (req, res) => {
  const userId = res.locals.userId as string;
  await db.user.update({ where: { id: userId }, data: { notificationsViewedAt: new Date() } });
  res.json({ success: true });
}));
