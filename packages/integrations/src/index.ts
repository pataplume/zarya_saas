// @zarya/integrations — wrappers : Infomaniak AI (souveraineté CH), Zefix, …
// (Bedrock/Mistral retirés de la chaîne IA, cf. ADR 0010.)

export type {
  IkChatCompletionParams,
  IkChatCompletionResponse,
  IkChatMessage,
  IkChatRole,
  IkModel,
  IkModelsResponse,
  IkResponseFormat,
  IkUsage,
  InfomaniakClientOptions,
  InfomaniakErrorCode,
  ModelCategory,
} from "./infomaniak";
export {
  InfomaniakClient,
  InfomaniakError,
  infomaniakClient,
} from "./infomaniak";
export type { ZefixAddress, ZefixCompanyDetail, ZefixCompanySummary, ZefixResultat } from "./zefix";
export { ZefixClient, ZefixError, zefixClient } from "./zefix";
