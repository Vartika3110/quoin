-- WhatsApp order lifecycle: vendor fulfilment legs, the outbound WhatsApp
-- log, and the two columns that turn a store into a notifiable vendor.
--
-- Nothing here changes `OrderStatus`, `orders`, `order_lines`,
-- `order_status_changes`, `payments` or `refunds`. The simplified
-- lifecycle (placed -> dispatched -> out for delivery -> delivered, plus
-- cancelled) is a narrowing of which transitions are *offered*, enforced
-- in `src/lib/data/orders.ts` and `src/lib/data/admin-orders.ts` — not a
-- rewrite of the enum. Dropping the retired values would delete the
-- history of every order that passed through CONFIRMED, PROCESSING or
-- PACKED, and that history must never be lost.

-- ---------------------------------------------------------------------
-- A store is this app's only idea of a vendor. These are what make one
-- reachable. See the model comment on `Store` in schema.prisma.
-- ---------------------------------------------------------------------
ALTER TABLE "stores" ADD COLUMN "whatsappPhone" TEXT;
ALTER TABLE "stores" ADD COLUMN "contactName" TEXT;

-- ---------------------------------------------------------------------
-- One store's share of one order.
-- ---------------------------------------------------------------------
CREATE TYPE "OrderFulfilmentStatus" AS ENUM ('PENDING', 'DISPATCHED', 'CANCELLED');

CREATE TABLE "order_fulfilments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    -- Snapshotted, exactly as `order_lines` snapshots the product: not a
    -- foreign key, and the name and number copied, so a store renamed or
    -- renumbered next quarter does not rewrite a past order's record.
    "storeId" TEXT NOT NULL,
    "storeCode" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "vendorPhone" TEXT,
    "status" "OrderFulfilmentStatus" NOT NULL DEFAULT 'PENDING',
    -- The vendor's only credential: holding it authorises one action on
    -- one fulfilment and nothing else.
    "actionToken" TEXT NOT NULL,
    "dispatchedAt" TIMESTAMP(3),
    "dispatchedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_fulfilments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_fulfilments_actionToken_key"
    ON "order_fulfilments"("actionToken");

-- Two lines from the same store are one vendor's work, not two.
CREATE UNIQUE INDEX "order_fulfilments_orderId_storeId_key"
    ON "order_fulfilments"("orderId", "storeId");

CREATE INDEX "order_fulfilments_orderId_idx" ON "order_fulfilments"("orderId");

-- The vendor queue, oldest outstanding first.
CREATE INDEX "order_fulfilments_status_createdAt_idx"
    ON "order_fulfilments"("status", "createdAt");

-- Cascade: a fulfilment is not a financial record of its own, it is part
-- of the order. Unlike the order, which is Restrict against the user.
ALTER TABLE "order_fulfilments" ADD CONSTRAINT "order_fulfilments_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull, matching `order_status_changes.actorUserId`: a staff account
-- being removed must not delete the record that the dispatch happened,
-- only the name attached to it.
ALTER TABLE "order_fulfilments" ADD CONSTRAINT "order_fulfilments_dispatchedByUserId_fkey"
    FOREIGN KEY ("dispatchedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- The outbound WhatsApp log. WhatsApp is a channel, never a source of
-- truth: dropping this whole table would lose no order, no payment and
-- no status.
-- ---------------------------------------------------------------------
CREATE TYPE "WhatsAppRecipient" AS ENUM ('CUSTOMER', 'VENDOR');

-- One value per approved template, and no more. There is deliberately no
-- ORDER_ACCEPTED, ORDER_PREPARING or ORDER_READY: those states do not
-- exist in this app's lifecycle.
CREATE TYPE "WhatsAppMessageType" AS ENUM (
    'ORDER_PLACED',
    'NEW_VENDOR_ORDER',
    'ORDER_DISPATCHED',
    'OUT_FOR_DELIVERY',
    'ORDER_DELIVERED',
    'ORDER_CANCELLED'
);

CREATE TYPE "WhatsAppStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'RETRYING');

CREATE TABLE "whatsapp_notifications" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fulfilmentId" TEXT,
    "recipientType" "WhatsAppRecipient" NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "messageType" "WhatsAppMessageType" NOT NULL,
    "status" "WhatsAppStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    -- The whole of this feature's idempotency. A repeated send is
    -- rejected by this index, not by a findFirst two statements earlier
    -- that a concurrent request can pass at the same time.
    "eventKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_notifications_eventKey_key"
    ON "whatsapp_notifications"("eventKey");

-- The order page reads its own WhatsApp activity oldest-first, as a story.
CREATE INDEX "whatsapp_notifications_orderId_createdAt_idx"
    ON "whatsapp_notifications"("orderId", "createdAt");

-- "Show me everything that failed", across all orders.
CREATE INDEX "whatsapp_notifications_status_createdAt_idx"
    ON "whatsapp_notifications"("status", "createdAt");

-- The delivery-status webhook arrives knowing only the provider's id.
CREATE INDEX "whatsapp_notifications_providerMessageId_idx"
    ON "whatsapp_notifications"("providerMessageId");

ALTER TABLE "whatsapp_notifications" ADD CONSTRAINT "whatsapp_notifications_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull rather than Cascade: that a vendor was messaged is a fact worth
-- keeping even if the fulfilment row it was about is ever removed.
ALTER TABLE "whatsapp_notifications" ADD CONSTRAINT "whatsapp_notifications_fulfilmentId_fkey"
    FOREIGN KEY ("fulfilmentId") REFERENCES "order_fulfilments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
