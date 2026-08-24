export { enMessages } from "./en";
export { arMessages } from "./ar";

type DeepStringRecord = {
  [key: string]: string | DeepStringRecord;
};

export type Messages = DeepStringRecord;
