export function expectedPostImagePathPrefix(input: {
  spaceId: string;
  membershipId: string;
  imageId: string;
}) {
  return `post-images/${input.spaceId}/${input.membershipId}/${input.imageId}/`;
}

export function processedPostImagePath(input: {
  spaceId: string;
  membershipId: string;
  imageId: string;
}) {
  return `${expectedPostImagePathPrefix(input)}__wavesparks_processed__.webp`;
}
