import "dotenv/config";
import { Gitlab } from "@gitbeaker/node";
import type { Types } from "@gitbeaker/node";
import fs from "fs/promises";
if (!process.env.GITLAB_TOKEN) {
  throw new Error(
    "GITLAB_TOKEN environment variable not defined. Check README!"
  );
}

type CleanedUpMergeRequest = {
  projectId: number;
  title: string;
  projectName: string;
  shortProjectName: string;
  description: string;
  mergedAt: string;
  yearAndQuarter: string;
};

type MergedMergeRequestsByProject = {
  projectId: number;
  projectName: string;
  mergedMergeRequests: number;
};

const run = async () => {
  const gitlabApi = new Gitlab({
    host: process.env.GITLAB_HOST,
    token: process.env.GITLAB_TOKEN,
  });
  const allProjects = await getOrLoadFile<Types.ProjectSchema[]>(
    "./allProjects.json",
    async () => await gitlabApi.Projects.all()
  );
  const allMergeRequests = await getOrLoadFile<Types.MergeRequestSchema[]>(
    "./allMergeRequests.json",
    async () =>
      gitlabApi.MergeRequests.all({ authorUsername: "dignat", state: "merged" })
  );

  const cleanedUpMergeRequests = allMergeRequests.map<CleanedUpMergeRequest>(
    (mergeRequest) => ({
      projectId: mergeRequest.project_id,
      title: mergeRequest.title,
      projectName:
        allProjects.find((project) => project.id === mergeRequest.project_id)
          ?.name_with_namespace || `Project with id ${mergeRequest.project_id}`,
      shortProjectName: (
        allProjects.find((project) => project.id === mergeRequest.project_id)
          ?.name || ""
      ),
      description: mergeRequest.description,
      mergedAt: mergeRequest.merged_at,
      yearAndQuarter: getYearAndQuarter(mergeRequest.merged_at),
    })
  );

  logInfoForMergeRequests("all time", cleanedUpMergeRequests);

  const mergeRequestsPerYearAndQuarter = cleanedUpMergeRequests.reduce<
    Record<string, CleanedUpMergeRequest[]>
  >((acc, mergeRequest) => {
    const yearAndQuarter = mergeRequest.yearAndQuarter;
    acc[yearAndQuarter] = acc[yearAndQuarter]
      ? [...acc[yearAndQuarter], mergeRequest]
      : [mergeRequest];
    return acc;
  }, {});

  for (const [time, mergeRequests] of Object.entries(
    mergeRequestsPerYearAndQuarter
  )) {
    console.log("---");
    logInfoForMergeRequests(time, mergeRequests);
  }
};

const logInfoForMergeRequests = (
  time: string,
  mergeRequests: CleanedUpMergeRequest[]
) => {
  console.log(`Statistics for ${time}`);
  console.log("Number of merged MRs: ", mergeRequests.length);
  const perProject = mergeRequests.reduce<
    Record<number, MergedMergeRequestsByProject>
  >((acc, mergeRequest) => {
    const projectId = mergeRequest.projectId;
    const existingProjectData = acc[projectId];
    acc[projectId] = existingProjectData
      ? {
          ...existingProjectData,
          mergedMergeRequests: existingProjectData.mergedMergeRequests + 1,
        }
      : {
          projectId: projectId,
          projectName: mergeRequest.projectName,
          mergedMergeRequests: 1,
        };
    return acc;
  }, []);
  console.log(
    "Number of projects with merged MRs: ",
    Object.keys(perProject).length
  );
  const topTenProjects = Object.values(perProject)
    .sort((a, b) => b.mergedMergeRequests - a.mergedMergeRequests)
    .slice(0, 10);
  console.log("Top 10 projects with merged MRs: ");
  topTenProjects.forEach((project, index) =>
    console.log(
      `${index + 1}. ${project.projectName}:`,
      project.mergedMergeRequests
    )
  );
};

const getOrLoadFile = async <T>(
  filename: string,
  getter: () => Promise<T>
): Promise<T> => {
  try {
    const dataFromFile = await fs.readFile(filename, "utf8");
    if (dataFromFile) {
      return JSON.parse(dataFromFile);
    }
  } catch (e) {}
  const dataFromApi = await getter();
  await fs.writeFile(filename, JSON.stringify(dataFromApi, null, 2));
  return dataFromApi;
};

const getYearAndQuarter = (date: string) => {
  const year = new Date(date).getFullYear();
  const month = new Date(date).getMonth();
  const quarter = Math.floor(month / 3) + 1;
  return `${year} Q${quarter}`;
};

run();
