export async function invokeTool<TIn, TOut>(tool: any, input: TIn): Promise<TOut> {
    if (typeof tool?.execute !== 'function') {
        throw new Error('Invalid tool object: missing execute()');
    }
    return tool.execute({ input });
}
