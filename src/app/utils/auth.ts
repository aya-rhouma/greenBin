// utils/auth.ts
export interface user {
  id: number;
  login: string;
  password: string;
  nom: string;
  prenom: string;
  role: string;
}

export async function validateUserCredentials(username: string, password: string): Promise<user | null> {
  try {
    const response = await fetch('/data/users.xml');
    const xmlText = await response.text();

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    const users = xmlDoc.getElementsByTagName("user");

    for (let i = 0; i < users.length; i++) {
      const u = users[i];

      const userLogin = u.getElementsByTagName("login")[0]?.textContent?.trim();
      const userPassword = u.getElementsByTagName("password")[0]?.textContent?.trim();

      if (userLogin === username && userPassword === password) {
        return {
          id: parseInt(u.getAttribute("id") || "0"),
          login: userLogin,
          password: userPassword,
          nom: u.getElementsByTagName("nom")[0]?.textContent?.trim() || "",
          prenom: u.getElementsByTagName("prenom")[0]?.textContent?.trim() || "",
          role: u.getElementsByTagName("role")[0]?.textContent?.trim() || "",
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error("Erreur lors de la validation des credentials:", error);
    return null;
  }
}