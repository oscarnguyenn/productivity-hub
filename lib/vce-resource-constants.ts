export const MAX_VCE_PERSONAL_FILE_BYTES = 50 * 1024 * 1024
export const MAX_VCE_SINGLE_PUT_BYTES = 50 * 1024 * 1024
export const MAX_SHARED_VCE_STORAGE_BYTES = 20_000_000_000
export const MAX_SHARED_VCE_FILE_BYTES = MAX_SHARED_VCE_STORAGE_BYTES
export const VCE_RESOURCE_CATEGORIES = ["Exams", "Textbooks", "Miscellaneous", "Contour", "Other"] as const

export type VceResourceCategory = (typeof VCE_RESOURCE_CATEGORIES)[number]
