type PaginateParams<T> = {
  model: any;
  query: any;
  select?: any;
  where?: any;
  orderBy?: any;
  include?: any;
};

export const paginate = async <T>({
  model,
  query,
  select,
  where,
  orderBy,
  include,
}: PaginateParams<T>) => {
  const page = Math.max(parseInt(query.page) || 1, 1);
  const limit = Math.max(parseInt(query.limit) || 10, 1);
  const skip = (page - 1) * limit;

  const findArgs: any = {
    where,
    orderBy: orderBy || { createdAt: "desc" },
    skip,
    take: limit,
  };

  if (select && Object.keys(select).length > 0) {
    findArgs.select = select;
  } else if (include) {
    findArgs.include = include;
  }

  const [total, data]: [number, T[]] = await Promise.all([
    model.count({ where }),
    model.findMany(findArgs),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      next: page < totalPages,
      prev: page > 1,
    },
  };
};
