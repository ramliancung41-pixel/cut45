import { postAgencyRequest } from "@/lib/agency-route";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return postAgencyRequest(request);
}
