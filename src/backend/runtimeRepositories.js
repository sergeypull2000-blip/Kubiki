import { kubikiApiRequest } from "./apiTransport.js";
import { createHttpRepositories } from "./httpRepositories.js";
import { createHttpLogoRepository } from "./logoRepository.js";

const repositories = createHttpRepositories(kubikiApiRequest);
const logoRepository = createHttpLogoRepository(kubikiApiRequest);

export const projectRepository = repositories.projects;
export const performerRepository = repositories.performers;
export const quickAccessRepository = repositories.quickAccess;
export const templateLibraryRepository = repositories.templateLibrary;
export const aiSettingsRepository = repositories.aiSettings;
export const exportPresetsRepository = repositories.exportPresets;
export const productEventsRepository = repositories.productEvents;
export const userFlagsRepository = repositories.userFlags;
export const betaFeedbackRepository = repositories.betaFeedback;
export const usageRepository = repositories.usage;
export const legalAcceptancesRepository = repositories.legalAcceptances;
export const aiFeedbackRepository = repositories.aiFeedback;
export const exportProfileRepository = { ...repositories.exportProfile, ...logoRepository };
