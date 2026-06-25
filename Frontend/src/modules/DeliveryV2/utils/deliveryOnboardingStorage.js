import { clearModuleAuth } from "@food/utils/auth"

export const DELIVERY_SIGNUP_DOC_TYPES = [
  "profilePhoto",
  "aadharPhoto",
  "panPhoto",
  "drivingLicensePhoto",
]

const ONBOARDING_SESSION_KEYS = [
  "deliverySignupDetails",
  "deliverySignupDocs",
  "deliveryNeedsRegistration",
  "deliveryAuthData",
]

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

export const serializeSignupDocument = async (file) => ({
  dataUrl: await fileToDataUrl(file),
  name: file.name || "document.jpg",
  type: file.type || "image/jpeg",
})

export const deserializeSignupDocument = (stored) => {
  if (!stored) return null

  const dataUrl =
    typeof stored === "string"
      ? stored
      : typeof stored?.dataUrl === "string"
        ? stored.dataUrl
        : ""

  if (!dataUrl.startsWith("data:image")) return null

  try {
    const [header, base64] = dataUrl.split(",")
    const mimeType = stored?.type || header.match(/:(.*?);/)?.[1] || "image/jpeg"
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }

    return new File([bytes], stored?.name || "document.jpg", { type: mimeType })
  } catch {
    return null
  }
}

export const sanitizeStoredSignupDocs = (docs) => {
  const sanitized = {}

  DELIVERY_SIGNUP_DOC_TYPES.forEach((docType) => {
    const value = docs?.[docType]
    if (!value) {
      sanitized[docType] = null
      return
    }

    const dataUrl =
      typeof value === "string"
        ? value
        : typeof value?.dataUrl === "string"
          ? value.dataUrl
          : ""

    if (!dataUrl.startsWith("data:image")) {
      sanitized[docType] = null
      return
    }

    sanitized[docType] = {
      dataUrl,
      name: value?.name || "document.jpg",
      type: value?.type || "image/jpeg",
    }
  })

  return sanitized
}

export const loadStoredSignupDocs = () => {
  if (typeof sessionStorage === "undefined") {
    return sanitizeStoredSignupDocs({})
  }

  try {
    const saved = sessionStorage.getItem("deliverySignupDocs")
    if (!saved) return sanitizeStoredSignupDocs({})
    return sanitizeStoredSignupDocs(JSON.parse(saved))
  } catch {
    return sanitizeStoredSignupDocs({})
  }
}

export const saveStoredSignupDocs = (docs) => {
  if (typeof sessionStorage === "undefined") return
  sessionStorage.setItem("deliverySignupDocs", JSON.stringify(sanitizeStoredSignupDocs(docs)))
}

export const restoreSignupDocumentsFromStorage = (storedDocs = loadStoredSignupDocs()) => {
  const restored = {}

  DELIVERY_SIGNUP_DOC_TYPES.forEach((docType) => {
    const file = deserializeSignupDocument(storedDocs[docType])
    if (file) restored[docType] = file
  })

  return restored
}

export const hasDeliveryStep1Progress = (formData = {}) => {
  const textFields = [
    "name",
    "email",
    "address",
    "city",
    "state",
    "vehicleName",
    "vehicleNumber",
    "drivingLicenseNumber",
    "panNumber",
    "aadharNumber",
  ]

  if (textFields.some((field) => String(formData[field] || "").trim())) {
    return true
  }

  if (formData.vehicleType && formData.vehicleType !== "bike") {
    return true
  }

  return false
}

const getOnboardingPhoneDigits = () => {
  if (typeof sessionStorage === "undefined") return ""

  try {
    const details = JSON.parse(sessionStorage.getItem("deliverySignupDetails") || "{}")
    return String(details.phone || "").replace(/\D/g, "")
  } catch {
    return ""
  }
}

export function clearDeliveryOnboardingData() {
  if (typeof sessionStorage !== "undefined") {
    const phone = getOnboardingPhoneDigits()

    ONBOARDING_SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key))

    if (phone) {
      sessionStorage.removeItem(`delivery_block_expires_at_${phone}`)
      sessionStorage.removeItem(`delivery_resend_expires_at_${phone}`)
    }

    sessionStorage.removeItem("delivery_block_expires_at")
    sessionStorage.removeItem("delivery_resend_expires_at")
  }

  clearModuleAuth("delivery")
}
