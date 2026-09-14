-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'TRIAL', 'PRO', 'ULTRA');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adWatchesToday" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastAdWatchReset" TIMESTAMP(3),
ADD COLUMN     "lastDailyCreditReset" TIMESTAMP(3),
ADD COLUMN     "subscriptionExpiresAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "trialAdsWatched" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trialUsedAt" TIMESTAMP(3);
