export async function invokeTool<TInput extends object, TOutput = any>(
    tool: any,                 // <- não tipamos rigidamente a tool
    input: TInput,
    options?: any,
): Promise<TOutput> {
    // A assinatura real é (context, options?), mas passamos só o que usamos:
    return tool.execute({ inputData: input } as any, options);
}
