-- AlterTable
ALTER TABLE "Generation" ADD COLUMN     "photoAExtraKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "photoBExtraKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];
