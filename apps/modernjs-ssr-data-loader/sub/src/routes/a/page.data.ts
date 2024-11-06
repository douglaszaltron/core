export type ProfileData = {
  message: string;
};
const loader = async (): Promise<ProfileData> => {
  const msg = await new Promise<string>((resolve) => {
    setTimeout(() => {
      resolve('page/a');
    }, 0);
  });
  return {
    message: msg,
  };
};
export { loader };
