export type OperatorProfileSource = "local_implicit" | "session" | "board_key";

export interface OperatorProfile {
  id: string;
  name: string;
  email: string;
  image: string | null;
  source: OperatorProfileSource;
  isInstanceAdmin: boolean;
}
