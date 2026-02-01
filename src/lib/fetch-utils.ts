/**
 * Robust JSON parsing utility that handles common edge cases
 * Prevents "Unexpected end of JSON input" errors
 */

export interface FetchResult<T> {
  data?: T;
  error?: string;
  status: number;
}

/**
 * Safely parse JSON response with fallback handling
 */
export async function safeJsonParse<T = unknown>(response: Response): Promise<FetchResult<T>> {
  const status = response.status;
  const contentType = response.headers.get("content-type");
  
  // Check if response has content
  const contentLength = response.headers.get("content-length");
  if (contentLength === "0") {
    return {
      error: "Server returned empty response",
      status,
    };
  }

  // Clone response so we can read it twice if needed
  const clonedResponse = response.clone();
  
  try {
    // Try to get text first
    const text = await response.text();
    
    // Empty response body
    if (!text || text.trim() === "") {
      return {
        error: "Server returned empty response",
        status,
      };
    }

    // If it's not JSON content type, return the text as error
    if (!contentType?.includes("application/json")) {
      return {
        error: `Server returned non-JSON response: ${text.substring(0, 200)}`,
        status,
      };
    }

    // Try to parse JSON
    const data = JSON.parse(text) as T;
    return { data, status };
    
  } catch (error) {
    // JSON parse failed - try to get text from clone
    try {
      const text = await clonedResponse.text();
      return {
        error: `Invalid JSON response: ${text.substring(0, 200)}`,
        status,
      };
    } catch {
      return {
        error: error instanceof Error ? error.message : "Failed to parse server response",
        status,
      };
    }
  }
}

/**
 * Make a safe JSON fetch request with proper error handling
 */
export async function safeFetch<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<FetchResult<T>> {
  try {
    const response = await fetch(url, options);
    return await safeJsonParse<T>(response);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Network request failed",
      status: 0,
    };
  }
}
