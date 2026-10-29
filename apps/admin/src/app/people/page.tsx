import PeoplePage from "./people";

// The page renders inside AdminGate, which shows the sign-in screen until it knows the visitor is
// an admin, so navigations here are not expected to be instant.
export const instant = false;

export default PeoplePage;
